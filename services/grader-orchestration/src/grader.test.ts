import { grade_code } from './grader';

describe('Grader Tests', () => {
  test('grade simple Rust code', async () => {
    const code = `
fn main() {
    println!("Hello, world!");
}
`;

    const testCases = [];
    const result = await grade_code(code, "rust", &testCases, 1000000, 30000, true);

    expect(result.is_ok()).toBe(true);
    let result_json = result.unwrap();
    expect(result_json.get("success")).toBe(Some(&serde_json::Value::Bool(true)));
  });

  test('enforce gas limit', async () => {
    const code = `
fn main() {
    // This should use minimal gas
    println!("Test");
}
`;

    const testCases = [];
    const result = await grade_code(code, "rust", &testCases, 100, 30000, true); // Very low gas limit

    // The function should still succeed but gas usage should be tracked
    expect(result.is_ok()).toBe(true);
  });

  test('enforce time limit', async () => {
    const code = `
fn main() {
    // Simple code that should complete quickly
    println!("Test");
}
`;

    const testCases = [];
    const result = await grade_code(code, "rust", &testCases, 1000000, 1, true); // 1ms timeout

    // Should still work for simple code
    expect(result.is_ok()).toBe(true);
  });
});