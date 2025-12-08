# Grader Orchestration Service - Worker Pool

This service implements a dynamic worker pool architecture for code grading and compilation tasks.

## Architecture

```
[Worker Pool]
├─ Grader Workers (Rust) -> docker / Firecracker
│  └─ Handles grading for: Rust, JavaScript, Python, Solidity, Move
└─ Compiler Workers (Foundry/Anvil, Hardhat, cargo, move-cli)
   └─ Specialized compilation for different blockchain/smart contract tools
```

## Worker Types

### Grader Workers (Rust-based)
- **grader_rust**: Primary grading worker using Rust for security and performance
- Supports multiple languages through compilation and execution
- Can run in Docker containers or Firecracker VMs

### Compiler Workers
- **compiler_foundry**: Solidity compilation using Foundry/Anvil
- **compiler_hardhat**: Solidity compilation using Hardhat
- **compiler_cargo**: Rust compilation using Cargo
- **compiler_move**: Move language compilation using Aptos CLI

## Worker Pool Management

The `WorkerPoolManager` handles:
- Dynamic worker creation and destruction
- Worker health monitoring
- Load balancing across available workers
- Resource cleanup and lifecycle management

### Configuration
```typescript
const workerPoolConfig = {
  maxWorkers: 10,
  workerTimeout: 300, // 5 minutes
  healthCheckInterval: 30000, // 30 seconds
  dockerImage: 'fathuss/worker:latest',
  firecrackerEnabled: false
};
```

## API Endpoints

### Submit Code for Grading
```http
POST /submit
Content-Type: application/json

{
  "challengeId": "challenge-123",
  "code": "contract MyContract { ... }",
  "language": "solidity",
  "tool": "foundry", // optional, for tool-specific compilation
  "testCases": [...],
  "metadata": {
    "gasLimit": 1000000,
    "timeLimit": 30,
    "enableTracing": true,
    "checkPlagiarism": true
  }
}
```

### Get Grading Result
```http
GET /submit/:jobId
```

Response includes queue position and estimated completion time for pending jobs.

### Get Execution Trace
```http
GET /submit/:jobId/trace
```

### Get Queue Status
```http
GET /queue/status
```

### Worker Pool Status
```http
GET /workers/status
```

## Submission Lifecycle

The grading service implements a comprehensive submission pipeline:

1. **Client Submission**: Code + metadata sent to `/submit` endpoint
2. **Authentication & Rate Limiting**: Session validation and rate limit checks
3. **Job Creation**: Record created in PostgreSQL, message queued in RabbitMQ
4. **Worker Assignment**: Orchestrator assigns job to available worker
5. **Fixture Fetching**: Worker pulls test fixtures from IPFS/S3 (read-only)
6. **Sandbox Execution**: Code runs in isolated environment with resource limits
7. **Test Execution**: Visible tests → Hidden tests → Fuzzing/Coverage analysis
8. **Result Processing**: Gas usage, execution traces, and artifacts collected
9. **Database Update**: Results stored, leaderboard/XP updated
10. **Client Notification**: Real-time updates via polling or pub/sub events

### Security Features
- **Network Isolation**: Workers have no network access
- **Resource Limits**: CPU, memory, and time constraints enforced
- **Privilege Dropping**: Workers run with minimal privileges
- **Sandboxing**: Code execution in isolated containers/VMs
- **Audit Trails**: Complete execution traces stored for review

### Database Integration
Jobs are tracked in PostgreSQL with full lifecycle state management:
- Job status: QUEUED → PROCESSING → COMPLETED/FAILED
- Result storage: Scores, gas usage, execution traces
- Leaderboard updates and XP calculations
- Plagiarism detection and audit logging

Workers are implemented in Rust using:
- **Warp**: HTTP server framework
- **Tokio**: Async runtime
- **Docker**: Container management
- **Firecracker**: MicroVM support (planned)

### Building Workers

```bash
# Build the worker Docker image
docker build -f worker.Dockerfile -t fathuss/worker:latest .

# Build Rust worker binary
cargo build --release
```

## Environment Variables

- `MAX_WORKERS`: Maximum number of concurrent workers (default: 10)
- `WORKER_TIMEOUT`: Job timeout in seconds (default: 300)
- `WORKER_DOCKER_IMAGE`: Docker image for workers (default: fathuss/worker:latest)
- `FIRECRACKER_ENABLED`: Enable Firecracker VMs (default: false)

## Language/Tool Mapping

### Automatic Mapping by Language
- `solidity` → `compiler_foundry`
- `rust` → `grader_rust`
- `javascript` → `grader_rust`
- `python` → `grader_rust`
- `move` → `compiler_move`

### Tool-Specific Mapping
- `foundry` → `compiler_foundry`
- `hardhat` → `compiler_hardhat`
- `cargo` → `compiler_cargo`
- `move-cli` → `compiler_move`

## Security Considerations

- Workers run in isolated Docker containers
- Firecracker VMs provide additional isolation (planned)
- Code execution is sandboxed within containers
- Resource limits prevent abuse
- Health checks ensure worker integrity