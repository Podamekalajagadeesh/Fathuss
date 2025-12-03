# Fathuss Services

Microservices architecture for the Fathuss platform.

## Services Overview

### User Service (Port 4001)
- User profile management
- User statistics and progress tracking
- Authentication integration

### Challenge Service (Port 4002)
- Challenge management and retrieval
- Submission handling
- Test case management

### Leaderboard Service (Port 4003)
- Global and challenge-specific leaderboards
- User ranking calculations
- Statistics and analytics

### Marketplace Service (Port 4004)
- Premium content marketplace
- NFT integration
- Subscription management

### Hiring Service (Port 4005)
- Job posting and applications
- Talent matching
- Interview coordination

### Grader Orchestration (Port 4006)
- Code grading coordination
- Multi-language support (Solidity, Rust, JavaScript, Python)
- Batch processing for tournaments

## Development Setup

1. Install dependencies for all services:
```bash
npm run services:install
```

2. Run all services in development:
```bash
npm run services:dev
```

3. Or run individual services:
```bash
npm run user-service:dev
npm run challenge-service:dev
# etc.
```

## API Gateway Integration

All services are accessed through the API Gateway (Port 4000) which handles:
- Authentication and authorization
- Request routing
- Rate limiting
- Response aggregation

## Database

Each service is designed to work with:
- PostgreSQL for relational data
- Redis for caching and sessions
- ClickHouse for analytics (future)

## Message Queue

Services communicate asynchronously via:
- RabbitMQ/Kafka for event-driven architecture
- Webhooks for external integrations

## Deployment

Services are containerized with Docker and orchestrated with Kubernetes.

## Health Checks

All services expose `/health` endpoints for monitoring.