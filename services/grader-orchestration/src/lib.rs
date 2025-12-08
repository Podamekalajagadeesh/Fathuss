pub mod sandbox;
pub mod fixtures;
pub mod fuzzer;
pub mod grader;
pub mod compiler;
pub mod anti_cheat;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::SandboxConfig;
    use std::time::Duration;

    #[tokio::test]
    async fn test_sandbox_execution() {
        let temp_dir = tempfile::tempdir().unwrap();
        let config = SandboxConfig::default();

        // Test simple echo command
        let result = sandbox::execute_in_sandbox(
            "echo",
            &["Hello, World!"],
            &config,
            temp_dir.path(),
        ).await;

        assert!(result.is_ok());
        let exec_result = result.unwrap();
        assert!(exec_result.success);
        assert_eq!(exec_result.stdout.trim(), "Hello, World!");
    }

    #[tokio::test]
    async fn test_timeout_enforcement() {
        let temp_dir = tempfile::tempdir().unwrap();
        let config = SandboxConfig {
            time_limit: Duration::from_millis(100), // Very short timeout
            ..Default::default()
        };

        // Test command that should timeout
        let result = sandbox::execute_in_sandbox(
            "sleep",
            &["1"], // Sleep for 1 second
            &config,
            temp_dir.path(),
        ).await;

        // Should fail due to timeout
        assert!(result.is_err() || !result.as_ref().unwrap().success);
    }

    #[test]
    fn test_fixture_parsing() {
        let fixture_data = serde_json::json!([{
            "id": "test-1",
            "name": "Simple Test",
            "description": "A simple test case",
            "input": {"value": 42},
            "expected_output": {"result": 84},
            "hidden": false,
            "timeout": 30,
            "gas_limit": 1000000
        }]);

        let manager = fixtures::FixtureManager::new("http://example.com".to_string(), "/tmp".to_string());
        let fixtures = manager.parse_fixtures(fixture_data).unwrap();

        assert_eq!(fixtures.len(), 1);
        assert_eq!(fixtures[0].id, "test-1");
        assert_eq!(fixtures[0].name, "Simple Test");
        assert!(!fixtures[0].hidden);
    }
}