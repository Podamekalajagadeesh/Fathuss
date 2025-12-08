# Fathuss Storage Architecture

This document describes the comprehensive storage architecture for the Fathuss platform.

## Architecture Overview

```
Storage Layer
├── Postgres (Primary Database)
│   ├── Metadata storage for all entities
│   ├── User profiles, challenges, submissions
│   ├── Marketplace items, job postings
│   └── File metadata (IPFS references)
│
├── Redis (Caching & Sessions)
│   ├── Session management
│   ├── Rate limiting data
│   ├── API response caching
│   └── Temporary data storage
│
├── ClickHouse (Analytics)
│   ├── User activity events
│   ├── Challenge completion metrics
│   ├── API usage statistics
│   ├── File upload/download analytics
│   └── Marketplace transaction data
│
└── IPFS (File Storage)
    ├── Test cases and fixtures
    ├── Challenge binaries
    ├── User uploaded content
    └── Static assets
```

## Services

### Storage Service (`services/storage-service/`)
Central service that coordinates all storage operations:

- **IPFS Integration**: File upload/download via IPFS
- **Analytics Aggregation**: ClickHouse data ingestion
- **Cache Management**: Redis operations
- **Metadata Storage**: Postgres file metadata

### Database Services

#### Postgres (Port 5432)
- **Purpose**: Primary relational database
- **Use Cases**: Structured data, relationships, transactions
- **Tables**: Users, challenges, submissions, marketplace, jobs, etc.

#### Redis (Port 6379)
- **Purpose**: High-performance caching and sessions
- **Use Cases**: Session storage, rate limiting, API caching
- **Data Types**: Strings, hashes, sorted sets

#### ClickHouse (Ports 8123/9000)
- **Purpose**: Real-time analytics database
- **Use Cases**: Event tracking, metrics aggregation, reporting
- **Features**: Column-oriented, high compression, fast queries

#### IPFS (Ports 4001/5001/8080)
- **Purpose**: Decentralized file storage
- **Use Cases**: Large files, test cases, challenge assets
- **Features**: Content-addressed, distributed, permanent storage

## API Endpoints

### File Operations
```http
POST /files/upload          # Upload file to IPFS
GET  /files/:hash           # Get file metadata
GET  /files/:hash/download  # Download file from IPFS
```

### Analytics
```http
GET /analytics/user-activity    # User activity metrics
GET /analytics/challenge-stats  # Challenge completion stats
```

### Cache Management
```http
POST /cache/set     # Set cache value
GET  /cache/get/:key # Get cache value
```

### Session Management
```http
POST /session/create        # Create user session
GET  /session/:sessionId    # Get session data
```

### Rate Limiting
```http
GET /rate-limit/status/:userId # Check rate limit status
```

## Data Flow Examples

### File Upload Flow
1. User uploads file via `/files/upload`
2. File stored in IPFS → returns CID/hash
3. Metadata stored in Postgres `file_metadata` table
4. Analytics event logged in ClickHouse `file_uploads`
5. Response includes IPFS hash and gateway URL

### Challenge Submission Flow
1. User submits code for grading
2. Code execution results stored in Postgres
3. Analytics data sent to ClickHouse for metrics
4. Leaderboard updated with caching in Redis

### Analytics Query Flow
1. Dashboard requests analytics data
2. Check Redis cache first
3. If cache miss, query ClickHouse
4. Cache results in Redis for future requests

## Configuration

### Environment Variables
```bash
# Storage Service
PORT=4007
DATABASE_URL=postgresql://user:password@postgres:5432/fathuss
REDIS_URL=redis://redis:6379
CLICKHOUSE_HOST=http://clickhouse:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=password
CLICKHOUSE_DB=fathuss_analytics
IPFS_HOST=ipfs
IPFS_PORT=5001
```

### Docker Compose Services
- `postgres`: PostgreSQL 15 with persistent storage
- `redis`: Redis 7 Alpine with data persistence
- `clickhouse`: ClickHouse with analytics tables
- `ipfs`: IPFS Kubo with server configuration
- `storage-service`: Node.js service coordinating all storage

## Performance Considerations

### Postgres
- Indexed on frequently queried columns
- Connection pooling recommended for high traffic
- Regular vacuuming and maintenance

### Redis
- Memory limits based on available RAM
- TTL policies for automatic cleanup
- Clustering for horizontal scaling

### ClickHouse
- Partitioned by date for efficient queries
- TTL policies for data retention
- MergeTree engine for optimal compression

### IPFS
- Pinning service for critical files
- Gateway caching for frequently accessed content
- Cluster setup for high availability

## Monitoring & Maintenance

### Health Checks
- All services include `/health` endpoints
- Docker health checks configured
- Metrics collection for performance monitoring

### Backup Strategy
- Postgres: Daily backups with WAL archiving
- Redis: RDB snapshots
- ClickHouse: Table-level backups
- IPFS: Content pinning and replication

### Scaling
- Postgres: Read replicas for analytics queries
- Redis: Cluster mode for distributed caching
- ClickHouse: Distributed tables across nodes
- IPFS: Cluster for distributed storage