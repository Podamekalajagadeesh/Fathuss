mod grader;
mod compiler;
mod sandbox;
mod fixtures;
mod fuzzer;

use crate::sandbox::{execute_in_sandbox, SandboxConfig, ExecutionResult};
use crate::fixtures::FixtureManager;
use crate::fuzzer::{Fuzzer, FuzzResult};
use std::env;
use std::sync::Arc;
use tokio::sync::Mutex;
use warp::Filter;
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Clone)]
struct WorkerState {
    worker_type: String,
}

#[tokio::main]
async fn main() {
    // Drop privileges early
    crate::sandbox::drop_privileges().unwrap_or_else(|e| {
        eprintln!("Warning: Failed to drop privileges: {}", e);
    });

    let worker_type = env::var("WORKER_TYPE").unwrap_or_else(|_| "grader_rust".to_string());
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8080".to_string()).parse().unwrap();

    println!("Starting {} worker on port {}", worker_type, port);

    let state = Arc::new(Mutex::new(WorkerState {
        worker_type: worker_type.clone(),
    }));

    // Health check endpoint
    let health = warp::path("health")
        .map(move || warp::reply::json(&serde_json::json!({"status": "ok", "worker_type": worker_type})));

    // Grading endpoint
    let grade = warp::path("grade")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_state(state.clone()))
        .and_then(handle_grade);

    let routes = health.or(grade);

    println!("Worker listening on http://0.0.0.0:{}", port);
    warp::serve(routes).run(([0, 0, 0, 0], port)).await;
}

fn with_state(state: Arc<Mutex<WorkerState>>) -> impl Filter<Extract = (Arc<Mutex<WorkerState>>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || state.clone())
}

async fn grade_with_full_pipeline(
    code: &str,
    language: &str,
    test_cases: &[Value],
    gas_limit: u64,
    time_limit: u64,
    enable_tracing: bool,
    challenge_id: &str,
    fixture_manager: &FixtureManager,
) -> Result<Value, String> {
    let start_time = std::time::Instant::now();

    // Create workspace - use local path if challenge_id starts with /
    let workspace_path = if challenge_id.starts_with('/') {
        std::path::PathBuf::from(challenge_id)
    } else {
        // Create temporary workspace
        let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {}", e))?;
        temp_dir.path().to_path_buf()
    };

    println!("Using workspace: {}", workspace_path.display());

    // Step 1: Fetch fixtures
    println!("Fetching fixtures for challenge: {}", challenge_id);
    let public_fixtures = fixture_manager
        .fetch_challenge_fixtures(challenge_id)
        .await
        .unwrap_or_else(|_| vec![]); // Continue with empty fixtures if fetch fails

    // Step 2: Prepare code
    println!("Preparing code for language: {}", language);
    prepare_code(code, language, workspace_path)?;

    // Step 3: Compile code
    println!("Compiling code...");
    let compile_result = compile_code(language, workspace_path).await?;
    if !compile_result.success {
        return Ok(json!({
            "success": false,
            "score": 0,
            "passedTests": 0,
            "totalTests": 0,
            "gasUsed": compile_result.gas_used,
            "timeUsed": start_time.elapsed().as_millis(),
            "output": compile_result.stdout,
            "error": compile_result.stderr,
            "language": language,
            "stage": "compilation",
            "executionTrace": if enable_tracing { compile_result.trace_events } else { vec![] }
        }));
    }

    // Step 4: Run public tests
    println!("Running public tests...");
    let public_test_results = run_test_suite(language, &public_fixtures, workspace_path, gas_limit, time_limit).await?;

    // Step 5: Fetch and run hidden tests
    println!("Running hidden tests...");
    let hidden_fixtures = fixture_manager
        .fetch_hidden_tests(challenge_id)
        .await
        .unwrap_or_else(|_| vec![]);

    let hidden_test_results = run_test_suite(language, &hidden_fixtures, workspace_path, gas_limit, time_limit).await?;

    // Step 6: Run fuzzing campaign
    println!("Running fuzzing campaign...");
    let fuzzer = Fuzzer::new(100, Duration::from_secs(5)); // 100 iterations, 5s timeout each
    let fuzz_result = fuzzer
        .run_fuzz_campaign(
            &public_fixtures,
            workspace_path,
            &get_compile_command(language),
            &get_run_command(language),
        )
        .await
        .unwrap_or(FuzzResult {
            inputs_tested: 0,
            crashes_found: vec![],
            unique_paths: 0,
            coverage_score: 0.0,
            execution_time: Duration::from_secs(0),
        });

    // Step 7: Calculate final score
    let total_tests = public_fixtures.len() + hidden_fixtures.len();
    let passed_tests = public_test_results.passed + hidden_test_results.passed;
    let score = if total_tests > 0 { (passed_tests * 100) / total_tests } else { 0 };

    // Penalize for fuzzing crashes
    let fuzz_penalty = fuzz_result.crashes_found.len() * 5;
    let final_score = score.saturating_sub(fuzz_penalty as usize);

    // Step 8: Collect comprehensive trace
    let execution_trace = if enable_tracing {
        json!({
            "compilation": compile_result.trace_events,
            "public_tests": public_test_results.trace_events,
            "hidden_tests": hidden_test_results.trace_events,
            "fuzzing": {
                "inputs_tested": fuzz_result.inputs_tested,
                "crashes_found": fuzz_result.crashes_found.len(),
                "unique_paths": fuzz_result.unique_paths,
                "coverage_score": fuzz_result.coverage_score
            }
        })
    } else {
        json!(null)
    };

    let total_gas_used = compile_result.gas_used + public_test_results.gas_used + hidden_test_results.gas_used;
    let total_time = start_time.elapsed().as_millis() as u64;

    Ok(json!({
        "success": final_score >= 70, // 70% passing threshold
        "score": final_score,
        "passedTests": passed_tests,
        "totalTests": total_tests,
        "gasUsed": total_gas_used,
        "timeUsed": total_time,
        "output": format!("Public: {}/{}, Hidden: {}/{}, Fuzz: {} crashes",
                         public_test_results.passed, public_fixtures.len(),
                         hidden_test_results.passed, hidden_fixtures.len(),
                         fuzz_result.crashes_found.len()),
        "error": "",
        "language": language,
        "executionTrace": execution_trace,
        "fuzzResult": {
            "inputsTested": fuzz_result.inputs_tested,
            "crashesFound": fuzz_result.crashes_found.len(),
            "uniquePaths": fuzz_result.unique_paths,
            "coverageScore": fuzz_result.coverage_score
        }
    }))
}

fn prepare_code(code: &str, language: &str, workspace: &std::path::Path) -> Result<(), String> {
    match language {
        "rust" => {
            // Write main.rs
            std::fs::write(workspace.join("main.rs"), code)
                .map_err(|e| format!("Failed to write main.rs: {}", e))?;

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
            std::fs::write(workspace.join("Cargo.toml"), cargo_toml)
                .map_err(|e| format!("Failed to write Cargo.toml: {}", e))?;
        },
        "solidity" => {
            // For Solidity, we'll use the existing compiler logic
            std::fs::write(workspace.join("Contract.sol"), code)
                .map_err(|e| format!("Failed to write Contract.sol: {}", e))?;
        },
        _ => {
            // Generic file preparation
            let ext = get_file_extension(language);
            std::fs::write(workspace.join(format!("code{}", ext)), code)
                .map_err(|e| format!("Failed to write code file: {}", e))?;
        }
    }
    Ok(())
}

async fn compile_code(language: &str, workspace: &std::path::Path) -> Result<ExecutionResult, String> {
    let sandbox_config = SandboxConfig {
        time_limit: Duration::from_secs(60), // 1 minute compile timeout
        memory_limit: 1024 * 1024 * 1024, // 1GB
        cpu_limit: 50,
        network_disabled: true,
        max_file_size: 100 * 1024 * 1024, // 100MB
        max_processes: 10,
        disk_quota: 500 * 1024 * 1024, // 500MB
    };

    let (command, args) = get_compile_command_with_args(language, workspace);
    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    execute_in_sandbox(&command, &args_refs, &sandbox_config, workspace).await
}

fn get_compile_command(language: &str) -> String {
    match language {
        "rust" => "cargo".to_string(),
        "solidity" => "solc".to_string(),
        _ => "echo".to_string(),
    }
}

fn get_compile_command_with_args(language: &str, workspace: &std::path::Path) -> (String, Vec<String>) {
    match language {
        "rust" => (
            "cargo".to_string(),
            vec!["build".to_string(), "--release".to_string()]
        ),
        "solidity" => (
            "forge".to_string(),
            vec!["build".to_string()]
        ),
        _ => (
            "echo".to_string(),
            vec!["compiled".to_string()]
        ),
    }
}

fn get_run_command(language: &str) -> String {
    match language {
        "rust" => "./target/release/grader-code".to_string(),
        "solidity" => "forge test".to_string(), // Solidity execution would be more complex
        _ => "echo".to_string(),
    }
}

fn get_file_extension(language: &str) -> &'static str {
    match language {
        "rust" => ".rs",
        "solidity" => ".sol",
        "javascript" => ".js",
        "python" => ".py",
        _ => ".txt",
    }
}

#[derive(Default)]
struct TestSuiteResult {
    passed: usize,
    total: usize,
    gas_used: u64,
    trace_events: Vec<crate::sandbox::TraceEvent>,
}

async fn run_test_suite(
    language: &str,
    fixtures: &[fixtures::TestFixture],
    workspace: &std::path::Path,
    gas_limit: u64,
    time_limit: u64,
) -> Result<TestSuiteResult, String> {
    let mut result = TestSuiteResult::default();
    result.total = fixtures.len();

    if language == "solidity" && !fixtures.is_empty() {
        // For Solidity, run forge test once for all tests
        let sandbox_config = SandboxConfig {
            time_limit: Duration::from_secs(300), // 5 minutes for tests
            memory_limit: 1024 * 1024 * 1024, // 1GB
            cpu_limit: 50,
            network_disabled: true,
            max_file_size: 100 * 1024 * 1024, // 100MB
            max_processes: 10,
            disk_quota: 500 * 1024 * 1024, // 500MB
        };

        let exec_result = execute_in_sandbox("forge", &["test"], &sandbox_config, workspace).await?;
        let passed = exec_result.success;

        if passed {
            result.passed = fixtures.len(); // Assume all tests passed
        }

        result.gas_used = exec_result.gas_used;
        result.trace_events = exec_result.trace_events;

        return Ok(result);
    }

    // Original logic for other languages
    for fixture in fixtures {
        let test_start = std::time::Instant::now();

        // Create test input file
        let input_file = format!("test_input_{}.json", fixture.id);
        std::fs::write(workspace.join(&input_file), serde_json::to_string_pretty(&fixture.input).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;

        // Run the test
        let sandbox_config = SandboxConfig {
            time_limit: Duration::from_secs(fixture.timeout.min(time_limit)),
            memory_limit: 512 * 1024 * 1024, // 512MB
            cpu_limit: 25,
            network_disabled: true,
            max_file_size: 10 * 1024 * 1024, // 10MB
            max_processes: 5,
            disk_quota: 50 * 1024 * 1024, // 50MB per test
        };

        let (run_command, run_args) = match language {
            "solidity" => ("forge".to_string(), vec!["test".to_string()]),
            _ => (get_run_command(language), vec![input_file.clone()]),
        };
        let args_refs: Vec<&str> = run_args.iter().map(|s| s.as_str()).collect();

        let exec_result = execute_in_sandbox(&run_command, &args_refs, &sandbox_config, workspace).await?;

        // Check if test passed (simplified - in real implementation, compare with expected output)
        let passed = match language {
            "solidity" => {
                // For solidity, forge test success means all tests passed
                exec_result.success
            },
            _ => exec_result.success && exec_result.exit_code == Some(0),
        };

        if passed {
            result.passed += 1;
        }

        result.gas_used += exec_result.gas_used;
        result.trace_events.extend(exec_result.trace_events);

        // Clean up
        let _ = std::fs::remove_file(workspace.join(&input_file));
    }

    Ok(result)
}

async fn handle_grade(
    payload: serde_json::Value,
    state: Arc<Mutex<WorkerState>>,
) -> Result<impl warp::Reply, warp::Rejection> {
    let worker_state = state.lock().await;

    println!("Processing grading job with worker type: {}", worker_state.worker_type);

    // Extract job details
    let code = payload.get("code").and_then(|v| v.as_str()).unwrap_or("");
    let language = payload.get("language").and_then(|v| v.as_str()).unwrap_or("");
    let empty_test_cases = vec![];
    let test_cases = payload.get("testCases").and_then(|v| v.as_array()).unwrap_or(&empty_test_cases);
    let gas_limit = payload.get("gasLimit").and_then(|v| v.as_u64()).unwrap_or(1000000);
    let time_limit = payload.get("timeLimit").and_then(|v| v.as_u64()).unwrap_or(30);
    let enable_tracing = payload.get("enableTracing").and_then(|v| v.as_bool()).unwrap_or(true);
    let challenge_id = payload.get("challengeId").and_then(|v| v.as_str()).unwrap_or("");

    // Initialize fixture manager
    let fixtures_base_url = env::var("FIXTURES_BASE_URL").unwrap_or_else(|_| "http://localhost:4000/api".to_string());
    let fixture_manager = FixtureManager::new(fixtures_base_url, "/tmp/fixtures_cache".to_string());

    // Route to appropriate handler based on worker type
    let result = match worker_state.worker_type.as_str() {
        "grader_rust" => grade_with_full_pipeline(
            code, language, test_cases, gas_limit, time_limit, enable_tracing, challenge_id, &fixture_manager
        ).await,
        "compiler_foundry" => compiler::compile_foundry(code).await,
        "compiler_hardhat" => compiler::compile_hardhat(code).await,
        "compiler_cargo" => compiler::compile_cargo(code).await,
        "compiler_move" => compiler::compile_move(code).await,
        _ => Err("Unsupported worker type".to_string()),
    };

    match result {
        Ok(result) => Ok(warp::reply::json(&result)),
        Err(error) => Ok(warp::reply::json(&serde_json::json!({
            "error": error,
            "status": "failed"
        }))),
    }
}