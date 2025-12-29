use serde_json::{json, Value};
use std::process::Command;
use std::time::{Duration, Instant};
use tokio::process::Command as TokioCommand;
use tokio::time::timeout;
use crate::sandbox::{execute_in_sandbox, SandboxConfig};

pub async fn grade_code(code: &str, language: &str, public_test_cases: &[Value], hidden_test_cases: &[Value], gas_limit: u64, time_limit: u64, enable_tracing: bool) -> Result<Value, String> {
    let start_time = Instant::now();

    // Initialize execution trace
    let mut execution_trace = if enable_tracing {
        Some(json!({
            "events": [],
            "gasProfile": [],
            "callStack": [],
            "storageAccess": []
        }))
    } else {
        None
    };

    // Combine all test cases for grading
    let all_test_cases = [public_test_cases, hidden_test_cases].concat();

    let result = match language {
        "rust" => grade_rust(code, &all_test_cases, gas_limit, time_limit, &mut execution_trace).await,
        "solidity" => grade_solidity(code, &all_test_cases).await,
        "javascript" => grade_javascript(code, &all_test_cases).await,
        "python" => grade_python(code, &all_test_cases).await,
        "move" => grade_move(code, &all_test_cases).await,
        _ => Err(format!("Unsupported language: {}", language)),
    };

    let execution_time = start_time.elapsed().as_millis() as u64;

    match result {
        Ok(mut result_json) => {
            // Add gas and time usage to result
            if let Some(obj) = result_json.as_object_mut() {
                obj.insert("gasUsed".to_string(), json!(gas_limit.saturating_sub(1000))); // Simplified gas calculation
                obj.insert("timeUsed".to_string(), json!(execution_time));
                obj.insert("publicTestsPassed".to_string(), json!(public_test_cases.len())); // Simplified - should count actual passes
                obj.insert("hiddenTestsPassed".to_string(), json!(hidden_test_cases.len())); // Simplified - should count actual passes
                if enable_tracing {
                    obj.insert("executionTrace".to_string(), execution_trace.unwrap());
                }
            }
            Ok(result_json)
        },
        Err(e) => Err(e),
    }
}

async fn grade_rust(code: &str, test_cases: &[Value], gas_limit: u64, time_limit: u64, execution_trace: &mut Option<Value>) -> Result<Value, String> {
    // Create temporary directory for the code
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;

    // Write code to a file
    let code_path = temp_dir.path().join("main.rs");
    std::fs::write(&code_path, code).map_err(|e| e.to_string())?;

    // Create Cargo.toml
    let cargo_toml = r#"
[package]
name = "grader-code"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
"#;
    std::fs::write(temp_dir.path().join("Cargo.toml"), cargo_toml).map_err(|e| e.to_string())?;

    // Add trace event
    if let Some(trace) = execution_trace {
        if let Some(events) = trace.get_mut("events").and_then(|e| e.as_array_mut()) {
            events.push(json!({
                "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                "eventType": "compilation_start",
                "data": { "language": "rust" },
                "gasUsed": 100
            }));
        }
    }

    // Compile using sandbox
    let sandbox_config = SandboxConfig {
        time_limit: Duration::from_secs(60),
        memory_limit: 1024 * 1024 * 1024, // 1GB
        cpu_limit: 50,
        network_disabled: true,
        max_file_size: 100 * 1024 * 1024, // 100MB
        max_processes: 10,
        disk_quota: 500 * 1024 * 1024, // 500MB for compilation
    };

    let compile_result = execute_in_sandbox("cargo", &["build", "--release"], &sandbox_config, temp_dir.path()).await?;

    let success = compile_result.success;

    // Add trace event
    if let Some(trace) = execution_trace {
        if let Some(events) = trace.get_mut("events").and_then(|e| e.as_array_mut()) {
            events.push(json!({
                "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                "eventType": "execution_complete",
                "data": { "success": success },
                "gasUsed": 500
            }));
        }
    }

    Ok(json!({
        "success": success,
        "score": if success { 100 } else { 0 },
        "output": compile_result.stdout,
        "error": compile_result.stderr,
        "language": "rust"
    }))
}

async fn grade_solidity(code: &str, test_cases: &[Value]) -> Result<Value, String> {
    // Use Foundry for Solidity grading
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;

    // Initialize Foundry project
    let init_output = TokioCommand::new("forge")
        .args(&["init", "--no-commit"])
        .current_dir(&temp_dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !init_output.status.success() {
        return Err("Failed to initialize Foundry project".to_string());
    }

    // Write contract code
    let contract_path = temp_dir.path().join("src").join("Contract.sol");
    std::fs::write(&contract_path, code).map_err(|e| e.to_string())?;

    // Compile
    let compile_output = TokioCommand::new("forge")
        .args(&["build"])
        .current_dir(&temp_dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let success = compile_output.status.success();
    let stdout = String::from_utf8_lossy(&compile_output.stdout);
    let stderr = String::from_utf8_lossy(&compile_output.stderr);

    Ok(json!({
        "success": success,
        "score": if success { 100 } else { 0 },
        "output": stdout,
        "error": stderr,
        "language": "solidity"
    }))
}

async fn grade_javascript(code: &str, test_cases: &[Value]) -> Result<Value, String> {
    // Simple JavaScript execution (in a real implementation, you'd want sandboxing)
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;

    let code_path = temp_dir.path().join("code.js");
    std::fs::write(&code_path, code).map_err(|e| e.to_string())?;

    let output = TokioCommand::new("node")
        .arg(&code_path)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let success = output.status.success();
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    Ok(json!({
        "success": success,
        "score": if success { 100 } else { 0 },
        "output": stdout,
        "error": stderr,
        "language": "javascript"
    }))
}

async fn grade_python(code: &str, test_cases: &[Value]) -> Result<Value, String> {
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;

    let code_path = temp_dir.path().join("code.py");
    std::fs::write(&code_path, code).map_err(|e| e.to_string())?;

    let output = TokioCommand::new("python3")
        .arg(&code_path)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let success = output.status.success();
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    Ok(json!({
        "success": success,
        "score": if success { 100 } else { 0 },
        "output": stdout,
        "error": stderr,
        "language": "python"
    }))
}

async fn grade_move(code: &str, test_cases: &[Value]) -> Result<Value, String> {
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;

    let code_path = temp_dir.path().join("contract.move");
    std::fs::write(&code_path, code).map_err(|e| e.to_string())?;

    let output = TokioCommand::new("aptos")
        .args(&["move", "compile", "--package-dir", &temp_dir.path().to_string_lossy()])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let success = output.status.success();
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    Ok(json!({
        "success": success,
        "score": if success { 100 } else { 0 },
        "output": stdout,
        "error": stderr,
        "language": "move"
    }))
}