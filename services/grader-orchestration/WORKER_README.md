# Grader Worker (Rust)

The Grader Worker is a secure, sandboxed execution environment that runs in ephemeral containers or microVMs to evaluate user-submitted code.

## Features

### 🔒 Security & Sandboxing
- **Ephemeral Execution**: Each grading job runs in a fresh, isolated environment
- **Network Isolation**: Completely disables network access during execution
- **Resource Limits**: Enforces strict CPU, memory, and time limits
- **Privilege Dropping**: Runs with minimal privileges (drops to nobody user)
- **File System Restrictions**: Limits file sizes and prevents directory traversal

### 🧪 Comprehensive Testing Pipeline
1. **Fetch Fixtures**: Downloads test cases and fixtures from remote storage
2. **Code Preparation**: Sets up the code environment (dependencies, build files)
3. **Compilation**: Compiles code with timeout and resource limits
4. **Public Test Execution**: Runs visible test cases
5. **Hidden Test Execution**: Runs additional secret test cases
6. **Fuzzing Campaign**: Performs fuzz testing to find edge cases and crashes

### 📊 Deterministic Artifacts
- **Execution Logs**: Detailed stdout/stderr capture
- **Gas Usage Tracking**: Precise gas consumption measurement
- **Call Traces**: Function call sequences and stack traces
- **Performance Metrics**: CPU, memory, and timing data
- **Coverage Analysis**: Code coverage from fuzzing campaigns

## Architecture

### Core Components

#### `sandbox.rs`
Implements the secure execution environment with:
- Resource limit enforcement (CPU, memory, file sizes)
- Process isolation and privilege management
- Timeout handling and cleanup
- Comprehensive execution tracing

#### `fixtures.rs`
Manages test data and fixtures:
- Remote fixture fetching with caching
- Test case parsing and validation
- Fuzz input generation
- Hidden test management

#### `fuzzer.rs`
Performs security-oriented fuzz testing:
- Input mutation and generation
- Crash detection and analysis
- Coverage tracking
- Path exploration

#### `grader.rs`
Language-specific grading logic:
- Code compilation and execution
- Test case evaluation
- Result aggregation
- Error handling

#### `worker.rs`
Main orchestration service:
- HTTP API endpoints
- Job processing pipeline
- Result formatting
- Health monitoring

## API Endpoints

### `POST /grade`
Submits code for comprehensive grading.

**Request Body:**
```json
{
  "code": "fn main() { println!(\"Hello!\"); }",
  "language": "rust",
  "challengeId": "challenge-123",
  "gasLimit": 1000000,
  "timeLimit": 30,
  "enableTracing": true
}
```

**Response:**
```json
{
  "success": true,
  "score": 95,
  "passedTests": 19,
  "totalTests": 20,
  "gasUsed": 45000,
  "timeUsed": 1250,
  "output": "Public: 10/10, Hidden: 9/10, Fuzz: 0 crashes",
  "executionTrace": { ... },
  "fuzzResult": {
    "inputsTested": 100,
    "crashesFound": 0,
    "uniquePaths": 45,
    "coverageScore": 0.78
  }
}
```

### `GET /health`
Returns worker health status and capabilities.

## Security Measures

### Resource Limits
- **CPU**: Limited to 50% of a core
- **Memory**: 512MB per test execution
- **Time**: 30 seconds maximum per test
- **File Size**: 10MB maximum per file
- **Processes**: Maximum 10 concurrent processes

### Network Security
- Complete network isolation during execution
- No internet access for any code
- Localhost access disabled

### Code Safety
- Privilege dropping to unprivileged user
- Restricted system call access
- Sandboxed file system operations
- Timeout enforcement at multiple levels

## Execution Pipeline

```
1. Fetch Fixtures
   ├── Download public test cases
   ├── Download hidden test cases
   └── Cache for performance

2. Code Preparation
   ├── Write code to temporary directory
   ├── Generate build files (Cargo.toml, etc.)
   └── Set up dependencies

3. Compilation Phase
   ├── Execute compiler in sandbox
   ├── Capture compilation errors
   └── Validate binary generation

4. Testing Phase
   ├── Run public test suite
   ├── Run hidden test suite
   └── Aggregate results

5. Fuzzing Phase
   ├── Generate fuzz inputs
   ├── Execute with mutations
   ├── Detect crashes and hangs
   └── Measure code coverage

6. Result Generation
   ├── Calculate final score
   ├── Generate execution traces
   ├── Collect performance metrics
   └── Produce deterministic output
```

## Configuration

Environment variables:
- `WORKER_TYPE`: Type of worker (grader_rust, compiler_foundry, etc.)
- `PORT`: HTTP server port (default: 8080)
- `FIXTURES_BASE_URL`: Base URL for fetching test fixtures

## Deterministic Execution

The worker ensures deterministic results through:
- Fixed random seeds for fuzzing
- Consistent execution environments
- Precise timing measurements
- Comprehensive state tracking
- Reproducible test ordering

## Error Handling

- **Compilation Failures**: Immediate failure with error details
- **Timeout Violations**: Terminated with timeout indication
- **Resource Exhaustion**: Killed with resource limit details
- **Security Violations**: Blocked with security error
- **Crash Detection**: Analyzed and categorized by severity

## Monitoring & Observability

- Detailed execution traces for debugging
- Performance metrics collection
- Security event logging
- Health check endpoints
- Comprehensive error reporting</content>
<parameter name="filePath">/workspaces/Fathuss/services/grader-orchestration/src/README.md