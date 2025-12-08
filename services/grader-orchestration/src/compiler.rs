use serde_json::json;
use std::process::Command;
use tokio::process::Command as TokioCommand;

pub async fn compile_foundry(code: &str) -> Result<serde_json::Value, String> {
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;

    // Check if we have a foundry.toml (for local challenges)
    let foundry_toml = temp_dir.path().join("foundry.toml");
    let is_foundry_project = foundry_toml.exists();

    if !is_foundry_project {
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
        "tool": "foundry",
        "output": stdout,
        "error": stderr,
        "artifacts": if success { serde_json::Value::String("generated".to_string()) } else { serde_json::Value::Null }
    }))
}

pub async fn compile_hardhat(code: &str) -> Result<serde_json::Value, String> {
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;

    // Initialize Hardhat project
    let init_output = TokioCommand::new("npx")
        .args(&["hardhat", "init", "--yes"])
        .current_dir(&temp_dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    // Write contract code
    let contract_path = temp_dir.path().join("contracts").join("Contract.sol");
    std::fs::write(&contract_path, code).map_err(|e| e.to_string())?;

    // Compile
    let compile_output = TokioCommand::new("npx")
        .args(&["hardhat", "compile"])
        .current_dir(&temp_dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let success = compile_output.status.success();
    let stdout = String::from_utf8_lossy(&compile_output.stdout);
    let stderr = String::from_utf8_lossy(&compile_output.stderr);

    let artifacts = if success { serde_json::Value::String("generated".to_string()) } else { serde_json::Value::Null };

    Ok(json!({
        "success": success,
        "tool": "foundry",
        "output": stdout,
        "error": stderr,
        "artifacts": artifacts
    }))
}

pub async fn compile_cargo(code: &str) -> Result<serde_json::Value, String> {
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;

    // Write code to a file
    let code_path = temp_dir.path().join("main.rs");
    std::fs::write(&code_path, code).map_err(|e| e.to_string())?;

    // Create Cargo.toml
    let cargo_toml = r#"
[package]
name = "compiled-code"
version = "0.1.0"
edition = "2021"

[dependencies]
"#;
    std::fs::write(temp_dir.path().join("Cargo.toml"), cargo_toml).map_err(|e| e.to_string())?;

    // Compile
    let compile_output = TokioCommand::new("cargo")
        .args(&["build", "--release", "--manifest-path", &temp_dir.path().join("Cargo.toml").to_string_lossy()])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let success = compile_output.status.success();
    let stdout = String::from_utf8_lossy(&compile_output.stdout);
    let stderr = String::from_utf8_lossy(&compile_output.stderr);

    let artifacts = if success { serde_json::Value::String("generated".to_string()) } else { serde_json::Value::Null };

    Ok(json!({
        "success": success,
        "tool": "hardhat",
        "output": stdout,
        "error": stderr,
        "artifacts": artifacts
    }))
}

pub async fn compile_move(code: &str) -> Result<serde_json::Value, String> {
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;

    // Create Move package structure
    std::fs::create_dir_all(temp_dir.path().join("sources")).map_err(|e| e.to_string())?;

    // Create Move.toml
    let move_toml = r#"
[package]
name = "compiled_contract"
version = "0.1.0"

[dependencies]
AptosStdlib = { git = "https://github.com/aptos-labs/aptos-core.git", subdir = "aptos-move/framework/aptos-stdlib", rev = "main" }
"#;
    std::fs::write(temp_dir.path().join("Move.toml"), move_toml).map_err(|e| e.to_string())?;

    // Write contract code
    let contract_path = temp_dir.path().join("sources").join("contract.move");
    std::fs::write(&contract_path, code).map_err(|e| e.to_string())?;

    // Compile
    let compile_output = TokioCommand::new("aptos")
        .args(&["move", "compile", "--package-dir", &temp_dir.path().to_string_lossy()])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let success = compile_output.status.success();
    let stdout = String::from_utf8_lossy(&compile_output.stdout);
    let stderr = String::from_utf8_lossy(&compile_output.stderr);

    let bytecode = if success { serde_json::Value::String("generated".to_string()) } else { serde_json::Value::Null };

    Ok(json!({
        "success": success,
        "tool": "move-cli",
        "output": stdout,
        "error": stderr,
        "bytecode": bytecode
    }))
}