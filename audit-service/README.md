# Fathuss Audit Service

A centralized audit logging service for the Fathuss platform that collects, stores, and forwards security and operational events.

## Features

- **Event Collection**: RESTful API for recording audit events
- **Data Persistence**: PostgreSQL storage with structured event data
- **Log Aggregation**: Integration with Loki for distributed logging
- **Caching**: Redis-based caching for recent events
- **Metrics**: Prometheus metrics for monitoring
- **Security**: Input validation, rate limiting, and secure defaults

## API Endpoints

### POST /audit
Record a new audit event.

**Request Body:**
```json
{
  "event_type": "challenge_authorship_change",
  "user_id": "user123",
  "resource_id": "challenge456",
  "action": "update",
  "details": {
    "old_author": "user789",
    "new_author": "user123"
  },
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "severity": "medium"
}
```

**Response:**
```json
{
  "id": "event-uuid",
  "status": "recorded"
}
```

### GET /audit/events
Query audit events with optional filters.

**Query Parameters:**
- `event_type`: Filter by event type
- `user_id`: Filter by user ID
- `limit`: Maximum number of results (default: 100)
- `offset`: Pagination offset (default: 0)

### GET /health
Health check endpoint.

### GET /ready
Readiness check endpoint.

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection URL
- `LOKI_URL`: Loki endpoint URL (default: http://localhost:3100)
- `PORT`: Server port (default: 8080)
- `NODE_ENV`: Environment (production/development)

## Supported Event Types

- `challenge_authorship_change`: Challenge ownership modifications
- `hiring_assessment`: Hiring assessment completions
- `security_login`: User authentication events
- `security_failed_login`: Failed login attempts
- `admin_action`: Administrative operations
- `data_access`: Sensitive data access events

## Database Schema

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  resource_id VARCHAR(255),
  action VARCHAR(255) NOT NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  severity VARCHAR(20) DEFAULT 'low'
);

CREATE INDEX idx_audit_events_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_user ON audit_events(user_id);
CREATE INDEX idx_audit_events_timestamp ON audit_events(timestamp DESC);
```

## Metrics

The service exposes Prometheus metrics at `/metrics`:

- `audit_events_total{event_type}`: Total number of audit events by type
- HTTP request metrics (via prometheus-api-metrics)

## Security

- Input validation using Joi schemas
- Helmet.js for security headers
- CORS configuration
- Non-root container execution
- Read-only root filesystem where possible

## Development

```bash
npm install
npm run dev  # Development with nodemon
npm test     # Run tests
npm start    # Production start
```

## Docker

```bash
docker build -t fathuss/audit-service .
docker run -p 8080:8080 fathuss/audit-service
```