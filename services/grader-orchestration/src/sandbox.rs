use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tokio::process::Command as TokioCommand;
use tokio::time::timeout;
use rlimit::{setrlimit, Resource};
use nix::unistd::{setuid, setgid, Uid, Gid};
use nix::sys::resource::{setrlimit as nix_setrlimit, Resource as NixResource};
use serde_json::{json, Value};
use cgroups_rs::{cgroup_builder::CgroupBuilder, Cgroup, Subsystem, CgroupPid};
use std::fs;

pub struct SandboxConfig {
    pub time_limit: Duration,
    pub memory_limit: u64, // in bytes
    pub cpu_limit: u64,    // in percentage
    pub network_disabled: bool,
    pub max_file_size: u64, // in bytes
    pub max_processes: u64,
    pub disk_quota: u64,   // in bytes for ephemeral volumes
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            time_limit: Duration::from_secs(30),
            memory_limit: 512 * 1024 * 1024, // 512MB
            cpu_limit: 50, // 50% CPU
            network_disabled: true,
            max_file_size: 10 * 1024 * 1024, // 10MB
            max_processes: 10,
            disk_quota: 100 * 1024 * 1024, // 100MB
        }
    }
}

pub struct ExecutionResult {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub execution_time: Duration,
    pub memory_used: u64,
    pub gas_used: u64,
    pub trace_events: Vec<TraceEvent>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct TraceEvent {
    pub timestamp: u64,
    pub event_type: String,
    pub data: Value,
    pub gas_used: u64,
    pub memory_used: u64,
}

pub async fn execute_in_sandbox(
    command: &str,
    args: &[&str],
    config: &SandboxConfig,
    working_dir: &std::path::Path,
) -> Result<ExecutionResult, String> {
    let start_time = Instant::now();
    let mut trace_events = Vec::new();

    // Record start event
    trace_events.push(TraceEvent {
        timestamp: start_time.elapsed().as_nanos() as u64,
        event_type: "execution_start".to_string(),
        data: json!({
            "command": command,
            "args": args,
            "working_dir": working_dir.to_string_lossy()
        }),
        gas_used: 100,
        memory_used: 0,
    });

    // Create a unique cgroup name
    let cgroup_name = format!("fathuss_sandbox_{}", uuid::Uuid::new_v4().simple());

    // Create cgroup with limits
    let cgroup = create_cgroup_with_limits(&cgroup_name, config)?;

    // Set up ephemeral volume with disk quota
    let temp_mount_point = setup_ephemeral_volume(config.disk_quota)?;

    // Set resource limits before execution
    set_resource_limits(config)?;

    // Execute with timeout
    let execution_result = timeout(config.time_limit, async {
        let mut child = TokioCommand::new(command)
            .args(args)
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        // Move process to cgroup
        if let Some(pid) = child.id() {
            add_process_to_cgroup(&cgroup, pid)?;
        }

        // If network is disabled, we would set up network namespaces here
        // For now, we'll rely on container-level network isolation

        let output = child.wait_with_output().await
            .map_err(|e| format!("Failed to wait for process: {}", e))?;

        Ok(output)
    }).await;

    let execution_time = start_time.elapsed();

    let result = match execution_result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code();

            // Record completion event
            trace_events.push(TraceEvent {
                timestamp: execution_time.as_nanos() as u64,
                event_type: "execution_complete".to_string(),
                data: json!({
                    "exit_code": exit_code,
                    "stdout_length": stdout.len(),
                    "stderr_length": stderr.len()
                }),
                gas_used: 200,
                memory_used: config.memory_limit / 2, // Simplified memory tracking
            });

            Ok(ExecutionResult {
                success: output.status.success(),
                exit_code,
                stdout,
                stderr,
                execution_time,
                memory_used: config.memory_limit / 2, // Simplified
                gas_used: 300, // Simplified gas calculation
                trace_events,
            })
        },
        Ok(Err(e)) => Err(e),
        Err(_) => {
            // Timeout occurred
            trace_events.push(TraceEvent {
                timestamp: execution_time.as_nanos() as u64,
                event_type: "execution_timeout".to_string(),
                data: json!({"reason": "time_limit_exceeded"}),
                gas_used: 0,
                memory_used: 0,
            });

            Err("Execution timed out".to_string())
        }
    };

    // Clean up cgroup
    if let Err(e) = cgroup.delete() {
        eprintln!("Warning: Failed to delete cgroup {}: {}", cgroup_name, e);
    }

    // Clean up temp mount
    if let Err(e) = std::process::Command::new("umount").arg(&temp_mount_point).status() {
        eprintln!("Warning: Failed to unmount {}: {:?}", temp_mount_point.display(), e);
    }
    if let Err(e) = std::fs::remove_dir(&temp_mount_point) {
        eprintln!("Warning: Failed to remove temp dir {}: {}", temp_mount_point.display(), e);
    }

    result
}

fn create_cgroup_with_limits(name: &str, config: &SandboxConfig) -> Result<Cgroup, String> {
    let hierarchy = cgroups_rs::hierarchies::auto();
    let cgroup = CgroupBuilder::new(name)
        .build(hierarchy)
        .map_err(|e| format!("Failed to create cgroup: {}", e))?;

    // Set CPU limit (quota in microseconds per period)
    if let Some(cpu) = cgroup.subsystems().iter().find(|s| matches!(s, Subsystem::Cpu(_))) {
        if let Subsystem::Cpu(ref cpu_ctrl) = cpu {
            let period = 100000; // 100ms
            let quota = (config.cpu_limit as u64 * period) / 100;
            cpu_ctrl.set_shares(1024).map_err(|e| format!("Failed to set CPU shares: {}", e))?;
            cpu_ctrl.set_cfs_quota(quota as i64).map_err(|e| format!("Failed to set CPU quota: {}", e))?;
        }
    }

    // Set memory limit
    if let Some(memory) = cgroup.subsystems().iter().find(|s| matches!(s, Subsystem::Mem(_))) {
        if let Subsystem::Mem(ref mem_ctrl) = memory {
            mem_ctrl.set_limit(config.memory_limit as i64).map_err(|e| format!("Failed to set memory limit: {}", e))?;
        }
    }

    // Set I/O limits for disk quota (approximate)
    // Note: blkio methods may vary by kernel version, commented out for now
    // if let Some(blkio) = cgroup.subsystems().iter().find(|s| matches!(s, Subsystem::BlkIo(_))) {
    //     if let Subsystem::BlkIo(ref blkio_ctrl) = blkio {
    //         // Limit read/write bytes per second (rough approximation of disk quota)
    //         let bps_limit = config.disk_quota / 10; // Allow 10 seconds worth of I/O
    //         blkio_ctrl.set_read_bps("/dev/sda", bps_limit).ok(); // Ignore errors if device doesn't exist
    //         blkio_ctrl.set_write_bps("/dev/sda", bps_limit).ok();
    //     }
    // }

    Ok(cgroup)
}

fn add_process_to_cgroup(cgroup: &Cgroup, pid: u32) -> Result<(), String> {
    cgroup.add_task(CgroupPid::from(pid as u64)).map_err(|e| format!("Failed to add process to cgroup: {}", e))
}

fn setup_ephemeral_volume(disk_quota: u64) -> Result<std::path::PathBuf, String> {
    // Create a temporary directory for the mount point
    let mount_point = std::env::temp_dir().join(format!("fathuss_temp_{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir(&mount_point).map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // Mount tmpfs with size limit
    let size_kb = disk_quota / 1024;
    let mount_cmd = format!("mount -t tmpfs -o size={}k tmpfs {}", size_kb, mount_point.display());
    std::process::Command::new("sh")
        .arg("-c")
        .arg(&mount_cmd)
        .status()
        .map_err(|e| format!("Failed to mount tmpfs: {}", e))?
        .success()
        .then_some(())
        .ok_or("Mount command failed")?;

    Ok(mount_point)
}

fn set_resource_limits(config: &SandboxConfig) -> Result<(), String> {
    // Set CPU time limit
    nix_setrlimit(
        NixResource::RLIMIT_CPU,
        config.time_limit.as_secs() as u64,
        config.time_limit.as_secs() as u64,
    ).map_err(|e| format!("Failed to set CPU limit: {}", e))?;

    // Set memory limit
    nix_setrlimit(
        NixResource::RLIMIT_AS,
        config.memory_limit,
        config.memory_limit,
    ).map_err(|e| format!("Failed to set memory limit: {}", e))?;

    // Set file size limit
    nix_setrlimit(
        NixResource::RLIMIT_FSIZE,
        config.max_file_size,
        config.max_file_size,
    ).map_err(|e| format!("Failed to set file size limit: {}", e))?;

    // Set number of processes limit
    nix_setrlimit(
        NixResource::RLIMIT_NPROC,
        config.max_processes,
        config.max_processes,
    ).map_err(|e| format!("Failed to set process limit: {}", e))?;

    Ok(())
}

pub fn drop_privileges() -> Result<(), String> {
    // Drop to nobody user if running as root
    if Uid::current().is_root() {
        setgid(Gid::from_raw(65534)).map_err(|e| format!("Failed to setgid: {}", e))?;
        setuid(Uid::from_raw(65534)).map_err(|e| format!("Failed to setuid: {}", e))?;
    }
    Ok(())
}