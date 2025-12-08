const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const winston = require('winston');
const LokiTransport = require('winston-loki');
const { Pool } = require('pg');
const Redis = require('ioredis');
const apiMetrics = require('prometheus-api-metrics');
const Joi = require('joi');

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Prometheus metrics
app.use(apiMetrics());

// Database connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const redis = new Redis(process.env.REDIS_URL);

// Winston logger with Loki transport
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new LokiTransport({
      host: process.env.LOKI_URL || 'http://localhost:3100',
      labels: { app: 'fathuss-audit-service' },
      json: true,
      format: winston.format.json(),
      replaceTimestamp: true,
      onConnectionError: (err) => console.error(err)
    })
  ]
});

// Audit event schema validation
const auditEventSchema = Joi.object({
  event_type: Joi.string().required(),
  user_id: Joi.string(),
  resource_id: Joi.string(),
  action: Joi.string().required(),
  details: Joi.object(),
  ip_address: Joi.string(),
  user_agent: Joi.string(),
  timestamp: Joi.date().default(() => new Date()),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').default('low')
});

// Metrics
const auditEventsTotal = {
  counter: 0,
  increment: function(type) {
    this.counter++;
    // In a real implementation, you'd use prom-client
    console.log(`Audit event: ${type}, total: ${this.counter}`);
  }
};

// Routes
app.post('/audit', async (req, res) => {
  try {
    const { error, value } = auditEventSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const auditEvent = {
      id: require('crypto').randomUUID(),
      ...value,
      timestamp: new Date()
    };

    // Store in database
    await pool.query(`
      INSERT INTO audit_events (id, event_type, user_id, resource_id, action, details, ip_address, user_agent, timestamp, severity)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      auditEvent.id,
      auditEvent.event_type,
      auditEvent.user_id,
      auditEvent.resource_id,
      auditEvent.action,
      JSON.stringify(auditEvent.details || {}),
      auditEvent.ip_address,
      auditEvent.user_agent,
      auditEvent.timestamp,
      auditEvent.severity
    ]);

    // Cache recent events in Redis
    await redis.lpush('audit_events_recent', JSON.stringify(auditEvent));
    await redis.ltrim('audit_events_recent', 0, 999); // Keep last 1000 events

    // Log to Loki
    logger.info('Audit event recorded', {
      event_type: auditEvent.event_type,
      user_id: auditEvent.user_id,
      resource_id: auditEvent.resource_id,
      action: auditEvent.action,
      severity: auditEvent.severity
    });

    // Update metrics
    auditEventsTotal.increment(auditEvent.event_type);

    res.status(201).json({ id: auditEvent.id, status: 'recorded' });
  } catch (error) {
    logger.error('Failed to record audit event', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/audit/events', async (req, res) => {
  try {
    const { event_type, user_id, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM audit_events WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (event_type) {
      query += ` AND event_type = $${paramIndex}`;
      params.push(event_type);
      paramIndex++;
    }

    if (user_id) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to fetch audit events', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await pool.end();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await pool.end();
  await redis.quit();
  process.exit(0);
});

app.listen(PORT, () => {
  logger.info(`Audit service listening on port ${PORT}`);
});