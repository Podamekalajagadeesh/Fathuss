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
POST /grade
Content-Type: application/json

{
  "challengeId": "challenge-123",
  "code": "contract MyContract { ... }",
  "language": "solidity",
  "tool": "foundry", // optional, for tool-specific compilation
  "testCases": [...]
}
```

### Get Grading Result
```http
GET /grade/:jobId
```

### Worker Pool Status
```http
GET /workers/status
```

## Worker Implementation

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