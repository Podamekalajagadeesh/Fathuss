use serde_json::{json, Value};
use std::process::Command;
use tokio::process::Command as TokioCommand;

pub async fn grade_code(code: &str, language: &str, test_cases: &[Value]) -> Result<Value, String> {
    match language {
        "rust" => grade_rust(code, test_cases).await,
        "solidity" => grade_solidity(code, test_cases).await,
        "javascript" => grade_javascript(code, test_cases).await,
        "python" => grade_python(code, test_cases).await,
        "move" => grade_move(code, test_cases).await,
        _ => Err(format!("Unsupported language: {}", language)),
    }
}

async fn grade_rust(code: &str, test_cases: &[Value]) -> Result<Value, String> {
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
"#;
    std::fs::write(temp_dir.path().join("Cargo.toml"), cargo_toml).map_err(|e| e.to_string())?;

    // Compile and run tests
    let output = TokioCommand::new("cargo")
        .args(&["test", "--manifest-path", &temp_dir.path().join("Cargo.toml").to_string_lossy()])
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