use crate::fixtures::TestFixture;
use crate::sandbox::{execute_in_sandbox, SandboxConfig, ExecutionResult};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;
use rand::prelude::*;
use sha2::{Digest, Sha256};

pub struct FuzzResult {
    pub inputs_tested: usize,
    pub crashes_found: Vec<FuzzCrash>,
    pub unique_paths: usize,
    pub coverage_score: f64,
    pub execution_time: Duration,
}

#[derive(Clone, Debug)]
pub struct FuzzCrash {
    pub input: Value,
    pub error_message: String,
    pub stack_trace: String,
    pub gas_used: u64,
    pub severity: CrashSeverity,
}

#[derive(Clone, Debug, PartialEq)]
pub enum CrashSeverity {
    Low,
    Medium,
    High,
    Critical,
}

pub struct Fuzzer {
    max_iterations: usize,
    timeout_per_test: Duration,
    max_input_size: usize,
    seed: u64,
}

impl Fuzzer {
    pub fn new(max_iterations: usize, timeout_per_test: Duration) -> Self {
        Self {
            max_iterations,
            timeout_per_test,
            max_input_size: 1024, // 1KB max input
            seed: rand::random(),
        }
    }

    pub async fn run_fuzz_campaign(
        &self,
        base_fixtures: &[TestFixture],
        working_dir: &Path,
        compile_command: &str,
        run_command: &str,
    ) -> Result<FuzzResult, String> {
        let start_time = std::time::Instant::now();
        let mut rng = StdRng::seed_from_u64(self.seed);

        let mut inputs_tested = 0;
        let mut crashes_found = Vec::new();
        let mut unique_paths = HashSet::new();
        let mut coverage_data = HashSet::new();

        // Generate fuzz inputs based on base fixtures
        let mut fuzz_inputs = Vec::new();
        for fixture in base_fixtures {
            // Generate variations of each base input
            let variations = self.generate_input_variations(&fixture.input, 10, &mut rng);
            fuzz_inputs.extend(variations);
        }

        // Add some completely random inputs
        for _ in 0..50 {
            fuzz_inputs.push(self.generate_random_input(&mut rng));
        }

        // Shuffle the inputs for better coverage
        fuzz_inputs.shuffle(&mut rng);

        // Limit to max_iterations
        let test_inputs = fuzz_inputs.into_iter().take(self.max_iterations).collect::<Vec<_>>();

        for input in test_inputs {
            inputs_tested += 1;

            // Create a unique test file for this input
            let test_file = format!("fuzz_test_{}.json", inputs_tested);
            let test_path = working_dir.join(&test_file);

            // Write the fuzz input to file
            let input_json = serde_json::to_string_pretty(&input)
                .map_err(|e| format!("Failed to serialize fuzz input: {}", e))?;

            tokio::fs::write(&test_path, &input_json)
                .await
                .map_err(|e| format!("Failed to write fuzz test file: {}", e))?;

            // Execute the test
            let sandbox_config = SandboxConfig {
                time_limit: self.timeout_per_test,
                memory_limit: 256 * 1024 * 1024, // 256MB for fuzzing
                cpu_limit: 25, // 25% CPU
                network_disabled: true,
                max_file_size: 1024 * 1024, // 1MB
                max_processes: 5,
                disk_quota: 10 * 1024 * 1024, // 10MB for fuzzing
            };

            let result = execute_in_sandbox(
                run_command,
                &[&test_file],
                &sandbox_config,
                working_dir,
            ).await;

            // Analyze the result
            match result {
                Ok(exec_result) => {
                    // Calculate path hash for uniqueness
                    let path_hash = self.calculate_path_hash(&exec_result);
                    unique_paths.insert(path_hash);

                    // Update coverage data
                    self.update_coverage(&exec_result, &mut coverage_data);

                    // Check for crashes
                    if !exec_result.success && exec_result.exit_code != Some(0) {
                        let crash = self.analyze_crash(&input, &exec_result);
                        if let Some(crash) = crash {
                            crashes_found.push(crash);
                        }
                    }
                },
                Err(e) => {
                    // Execution failed - this might be a crash
                    let crash = FuzzCrash {
                        input: input.clone(),
                        error_message: e,
                        stack_trace: "Execution failed in sandbox".to_string(),
                        gas_used: 0,
                        severity: CrashSeverity::Medium,
                    };
                    crashes_found.push(crash);
                }
            }

            // Clean up test file
            let _ = tokio::fs::remove_file(&test_path).await;
        }

        let execution_time = start_time.elapsed();
        let coverage_score = self.calculate_coverage_score(&coverage_data);

        Ok(FuzzResult {
            inputs_tested,
            crashes_found,
            unique_paths: unique_paths.len(),
            coverage_score,
            execution_time,
        })
    }

    fn generate_input_variations(&self, base_input: &Value, count: usize, rng: &mut StdRng) -> Vec<Value> {
        let mut variations = Vec::new();

        for _ in 0..count {
            let variation = match base_input {
                Value::Number(n) => {
                    let base = n.as_f64().unwrap_or(0.0);
                    let delta = rng.gen_range(-100.0..100.0);
                    json!(base + delta)
                },
                Value::String(s) => {
                    let mut chars: Vec<char> = s.chars().collect();
                    if !chars.is_empty() {
                        let idx = rng.gen_range(0..chars.len());
                        chars[idx] = rng.gen::<char>();
                        json!(chars.into_iter().collect::<String>())
                    } else {
                        json!(self.generate_random_string(rng, 10))
                    }
                },
                Value::Array(arr) => {
                    let mut new_arr = arr.clone();
                    if !new_arr.is_empty() {
                        let idx = rng.gen_range(0..new_arr.len());
                        new_arr[idx] = self.generate_random_value(rng);
                    }
                    json!(new_arr)
                },
                Value::Object(obj) => {
                    let mut new_obj = obj.clone();
                    let keys: Vec<&String> = obj.keys().collect();
                    if !keys.is_empty() {
                        let key = keys[rng.gen_range(0..keys.len())];
                        new_obj.insert(key.clone(), self.generate_random_value(rng));
                    }
                    json!(new_obj)
                },
                _ => self.generate_random_value(rng),
            };
            variations.push(variation);
        }

        variations
    }

    fn generate_random_input(&self, rng: &mut StdRng) -> Value {
        self.generate_random_value(rng)
    }

    fn generate_random_value(&self, rng: &mut StdRng) -> Value {
        match rng.gen_range(0..5) {
            0 => json!(rng.gen::<i64>()),
            1 => json!(rng.gen::<f64>()),
            2 => {
                let len = rng.gen_range(0..50);
                json!(self.generate_random_string(rng, len))
            },
            3 => {
                let len = rng.gen_range(0..10);
                let arr: Vec<Value> = (0..len)
                    .map(|_| self.generate_random_value(rng))
                    .collect();
                json!(arr)
            },
            _ => {
                let mut obj = serde_json::Map::new();
                let num_fields = rng.gen_range(0..5);
                for _ in 0..num_fields {
                    let key_len = rng.gen_range(1..10);
                    let key = self.generate_random_string(rng, key_len);
                    let value = self.generate_random_value(rng);
                    obj.insert(key, value);
                }
                json!(obj)
            }
        }
    }

    fn generate_random_string(&self, rng: &mut StdRng, len: usize) -> String {
        (0..len)
            .map(|_| rng.gen::<char>())
            .collect()
    }

    fn calculate_path_hash(&self, result: &ExecutionResult) -> String {
        let mut hasher = Sha256::new();
        hasher.update(result.stdout.as_bytes());
        hasher.update(result.stderr.as_bytes());
        hasher.update(&result.exit_code.unwrap_or(0).to_le_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn update_coverage(&self, result: &ExecutionResult, coverage_data: &mut HashSet<String>) {
        // Simple coverage tracking based on output patterns
        let combined_output = format!("{}{}", result.stdout, result.stderr);

        // Extract "coverage" markers from output (language-specific)
        for line in combined_output.lines() {
            if line.contains("branch") || line.contains("line") || line.contains("function") {
                coverage_data.insert(line.to_string());
            }
        }
    }

    fn calculate_coverage_score(&self, coverage_data: &HashSet<String>) -> f64 {
        // Simple coverage score based on unique coverage points
        let score = coverage_data.len() as f64 / 1000.0; // Normalize to 0-1 range
        score.min(1.0)
    }

    fn analyze_crash(&self, input: &Value, result: &ExecutionResult) -> Option<FuzzCrash> {
        let error_message = if !result.stderr.is_empty() {
            result.stderr.clone()
        } else if !result.stdout.is_empty() {
            result.stdout.clone()
        } else {
            "Unknown crash".to_string()
        };

        // Determine severity based on error patterns
        let severity = if error_message.contains("panic") || error_message.contains("segmentation fault") {
            CrashSeverity::Critical
        } else if error_message.contains("overflow") || error_message.contains("null pointer") {
            CrashSeverity::High
        } else if error_message.contains("assertion failed") {
            CrashSeverity::Medium
        } else {
            CrashSeverity::Low
        };

        // Extract stack trace (simplified)
        let stack_trace = self.extract_stack_trace(&result.stderr);

        Some(FuzzCrash {
            input: input.clone(),
            error_message,
            stack_trace,
            gas_used: result.gas_used,
            severity,
        })
    }

    fn extract_stack_trace(&self, stderr: &str) -> String {
        let mut stack_trace = String::new();
        let mut in_stack = false;

        for line in stderr.lines() {
            if line.contains("stack backtrace") || line.contains("Stack trace") {
                in_stack = true;
            }

            if in_stack {
                stack_trace.push_str(line);
                stack_trace.push('\n');

                // Stop after reasonable number of lines
                if stack_trace.lines().count() > 20 {
                    break;
                }
            }
        }

        if stack_trace.is_empty() {
            "No stack trace available".to_string()
        } else {
            stack_trace
        }
    }
}