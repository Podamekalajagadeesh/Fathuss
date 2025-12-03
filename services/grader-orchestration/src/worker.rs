mod grader;
mod compiler;

use std::env;
use std::sync::Arc;
use tokio::sync::Mutex;
use warp::Filter;

#[derive(Clone)]
struct WorkerState {
    worker_type: String,
}

#[tokio::main]
async fn main() {
    let worker_type = env::var("WORKER_TYPE").unwrap_or_else(|_| "grader_rust".to_string());
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8080".to_string()).parse().unwrap();

    println!("Starting {} worker on port {}", worker_type, port);

    let state = Arc::new(Mutex::new(WorkerState {
        worker_type: worker_type.clone(),
    }));

    // Health check endpoint
    let health = warp::path("health")
        .map(|| warp::reply::json(&serde_json::json!({"status": "ok", "worker_type": worker_type})));

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

async fn handle_grade(
    payload: serde_json::Value,
    state: Arc<Mutex<WorkerState>>,
) -> Result<impl warp::Reply, warp::Rejection> {
    let worker_state = state.lock().await;

    println!("Processing grading job with worker type: {}", worker_state.worker_type);

    // Extract job details
    let code = payload.get("code").and_then(|v| v.as_str()).unwrap_or("");
    let language = payload.get("language").and_then(|v| v.as_str()).unwrap_or("");
    let test_cases = payload.get("testCases").and_then(|v| v.as_array()).unwrap_or(&vec![]);

    // Route to appropriate handler based on worker type
    let result = match worker_state.worker_type.as_str() {
        "grader_rust" => grader::grade_code(code, language, test_cases).await,
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