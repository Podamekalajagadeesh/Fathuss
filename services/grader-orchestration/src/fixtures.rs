use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use sha2::{Digest, Sha256};
use tokio::fs as async_fs;

pub struct TestFixture {
    pub id: String,
    pub name: String,
    pub description: String,
    pub input: Value,
    pub expected_output: Value,
    pub hidden: bool,
    pub timeout: u64,
    pub gas_limit: u64,
}

pub struct FixtureManager {
    client: Client,
    cache_dir: String,
    fixtures_base_url: String,
}

impl FixtureManager {
    pub fn new(fixtures_base_url: String, cache_dir: String) -> Self {
        Self {
            client: Client::new(),
            cache_dir,
            fixtures_base_url,
        }
    }

    pub async fn fetch_challenge_fixtures(&self, challenge_id: &str) -> Result<Vec<TestFixture>, String> {
        let fixtures_url = format!("{}/challenges/{}/fixtures", self.fixtures_base_url, challenge_id);

        // Try to get from cache first
        let cache_key = format!("fixtures_{}", challenge_id);
        if let Ok(cached) = self.get_cached_fixtures(&cache_key).await {
            return Ok(cached);
        }

        // Fetch from remote
        let response = self.client
            .get(&fixtures_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch fixtures: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to fetch fixtures: HTTP {}", response.status()));
        }

        let fixtures_data: Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse fixtures JSON: {}", e))?;

        let fixtures = self.parse_fixtures(fixtures_data)?;

        // Cache the fixtures
        self.cache_fixtures(&cache_key, &fixtures).await?;

        Ok(fixtures)
    }

    pub async fn fetch_hidden_tests(&self, challenge_id: &str) -> Result<Vec<TestFixture>, String> {
        let hidden_url = format!("{}/challenges/{}/hidden-tests", self.fixtures_base_url, challenge_id);

        // Hidden tests are always fetched fresh (not cached)
        let response = self.client
            .get(&hidden_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch hidden tests: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to fetch hidden tests: HTTP {}", response.status()));
        }

        let hidden_data: Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse hidden tests JSON: {}", e))?;

        self.parse_fixtures(hidden_data)
    }

    fn parse_fixtures(&self, data: Value) -> Result<Vec<TestFixture>, String> {
        let fixtures_array = data
            .as_array()
            .ok_or("Fixtures data is not an array")?;

        let mut fixtures = Vec::new();

        for fixture_value in fixtures_array {
            let fixture = self.parse_single_fixture(fixture_value)?;
            fixtures.push(fixture);
        }

        Ok(fixtures)
    }

    fn parse_single_fixture(&self, data: &Value) -> Result<TestFixture, String> {
        let id = data
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or("Fixture missing id")?
            .to_string();

        let name = data
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unnamed test")
            .to_string();

        let description = data
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let input = data
            .get("input")
            .cloned()
            .unwrap_or(json!(null));

        let expected_output = data
            .get("expected_output")
            .cloned()
            .unwrap_or(json!(null));

        let hidden = data
            .get("hidden")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let timeout = data
            .get("timeout")
            .and_then(|v| v.as_u64())
            .unwrap_or(30);

        let gas_limit = data
            .get("gas_limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(1000000);

        Ok(TestFixture {
            id,
            name,
            description,
            input,
            expected_output,
            hidden,
            timeout,
            gas_limit,
        })
    }

    async fn get_cached_fixtures(&self, cache_key: &str) -> Result<Vec<TestFixture>, String> {
        let cache_path = Path::new(&self.cache_dir).join(format!("{}.json", cache_key));

        if !cache_path.exists() {
            return Err("Cache miss".to_string());
        }

        let cache_content = async_fs::read_to_string(&cache_path)
            .await
            .map_err(|e| format!("Failed to read cache: {}", e))?;

        let cached_data: Value = serde_json::from_str(&cache_content)
            .map_err(|e| format!("Failed to parse cache: {}", e))?;

        self.parse_fixtures(cached_data)
    }

    async fn cache_fixtures(&self, cache_key: &str, fixtures: &[TestFixture]) -> Result<(), String> {
        // Create cache directory if it doesn't exist
        async_fs::create_dir_all(&self.cache_dir)
            .await
            .map_err(|e| format!("Failed to create cache dir: {}", e))?;

        let cache_path = Path::new(&self.cache_dir).join(format!("{}.json", cache_key));

        let fixtures_json: Vec<Value> = fixtures
            .iter()
            .map(|f| json!({
                "id": f.id,
                "name": f.name,
                "description": f.description,
                "input": f.input,
                "expected_output": f.expected_output,
                "hidden": f.hidden,
                "timeout": f.timeout,
                "gas_limit": f.gas_limit
            }))
            .collect();

        let cache_content = serde_json::to_string_pretty(&fixtures_json)
            .map_err(|e| format!("Failed to serialize fixtures: {}", e))?;

        async_fs::write(&cache_path, cache_content)
            .await
            .map_err(|e| format!("Failed to write cache: {}", e))?;

        Ok(())
    }

    pub fn generate_fuzz_inputs(&self, base_input: &Value, count: usize) -> Vec<Value> {
        let mut fuzz_inputs = Vec::new();

        // Generate simple fuzz variations
        for i in 0..count {
            match base_input {
                Value::Number(n) => {
                    // Fuzz numbers by adding/subtracting small amounts
                    let base = n.as_f64().unwrap_or(0.0);
                    let fuzzed = base + (i as f64 - count as f64 / 2.0) * 0.1;
                    fuzz_inputs.push(json!(fuzzed));
                },
                Value::String(s) => {
                    // Fuzz strings by adding characters or modifying slightly
                    let mut fuzzed = s.clone();
                    if i % 3 == 0 {
                        fuzzed.push('x');
                    } else if i % 3 == 1 && !fuzzed.is_empty() {
                        fuzzed.remove(fuzzed.len() - 1);
                    }
                    fuzz_inputs.push(json!(fuzzed));
                },
                Value::Array(arr) => {
                    // Fuzz arrays by modifying elements
                    let mut fuzzed = arr.clone();
                    if !fuzzed.is_empty() {
                        let idx = i % fuzzed.len();
                        fuzzed[idx] = json!("fuzz");
                    }
                    fuzz_inputs.push(json!(fuzzed));
                },
                _ => {
                    // For other types, just add some variation
                    fuzz_inputs.push(json!({
                        "fuzz_id": i,
                        "original": base_input
                    }));
                }
            }
        }

        fuzz_inputs
    }
}