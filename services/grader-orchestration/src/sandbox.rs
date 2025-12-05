use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tokio::process::Command as TokioCommand;
use tokio::time::timeout;
use rlimit::{setrlimit, Resource};
use nix::unistd::{setuid, setgid, Uid, Gid};
use nix::sys::resource::{setrlimit as nix_setrlimit, Resource as NixResource};
use serde_json::{json, Value};

pub struct SandboxConfig {
    pub time_limit: Duration,
    pub memory_limit: u64, // in bytes
    pub cpu_limit: u64,    // in percentage
    pub network_disabled: bool,
    pub max_file_size: u64, // in bytes
    pub max_processes: u64,
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

#[derive(Clone, Debug)]
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

        // If network is disabled, we would set up network namespaces here
        // For now, we'll rely on container-level network isolation

        let output = child.wait_with_output().await
            .map_err(|e| format!("Failed to wait for process: {}", e))?;

        Ok(output)
    }).await;

    let execution_time = start_time.elapsed();

    match execution_result {
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
    }
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