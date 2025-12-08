import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import multer from 'multer';
import { createClient as createClickHouseClient } from '@clickhouse/client';
import { createClient as createRedisClient } from 'redis';
import { create as createIPFSClient } from 'ipfs-http-client';
import { createReadStream } from 'fs';
import { Client as PostgresClient } from 'pg';
import { AnomalyDetector } from './anomaly-detector';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4007;

// Database clients
const clickhouse = createClickHouseClient({
  host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || 'password',
  database: process.env.CLICKHOUSE_DB || 'fathuss_analytics'
});

// Initialize anomaly detector
const anomalyDetector = new AnomalyDetector(clickhouse);

const redisClient = createRedisClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

const postgresClient = new PostgresClient({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/fathuss'
});
postgresClient.connect().catch(console.error);

// IPFS client
const ipfs = createIPFSClient({
  host: process.env.IPFS_HOST || 'localhost',
  port: parseInt(process.env.IPFS_PORT || '5001'),
  protocol: 'http'
});

// Multer configuration for file uploads
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  storage: multer.memoryStorage()
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);

// Auth middleware (simplified)
const authenticateToken = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  (req as any).user = { id: 'user-123', address: '0x...' };
  next();
};

// IPFS File Upload
app.post('/files/upload', authenticateToken, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { buffer, originalname, mimetype, size } = req.file;
    const userId = (req as any).user.id;
    const fileType = req.body.fileType || 'misc'; // testcase, fixture, binary, etc.

    // Add file to IPFS
    const result = await ipfs.add({
      path: originalname,
      content: buffer
    });

    const ipfsHash = result.cid.toString();

    // Store metadata in Postgres
    await postgresClient.query(
      `INSERT INTO file_metadata (id, filename, ipfs_hash, file_type, mime_type, size, uploaded_by, uploaded_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
      [originalname, ipfsHash, fileType, mimetype, size, userId]
    );

    // Log to ClickHouse analytics
    await clickhouse.insert({
      table: 'file_uploads',
      values: [{
        user_id: userId,
        filename: originalname,
        ipfs_hash: ipfsHash,
        file_type: fileType,
        size: size,
        uploaded_at: new Date()
      }],
      format: 'JSONEachRow'
    });

    res.json({
      success: true,
      ipfsHash,
      filename: originalname,
      size,
      url: `https://ipfs.io/ipfs/${ipfsHash}`
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Get file metadata
app.get('/files/:hash', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;

    const result = await postgresClient.query(
      'SELECT * FROM file_metadata WHERE ipfs_hash = $1',
      [hash]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('File metadata error:', error);
    res.status(500).json({ error: 'Failed to get file metadata' });
  }
});

// Download file from IPFS
app.get('/files/:hash/download', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;

    // Check if file exists in metadata
    const metadata = await postgresClient.query(
      'SELECT * FROM file_metadata WHERE ipfs_hash = $1',
      [hash]
    );

    if (metadata.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = metadata.rows[0];

    // Stream file from IPFS
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);

    for await (const chunk of ipfs.cat(hash)) {
      res.write(chunk);
    }
    res.end();

    // Log download analytics
    await clickhouse.insert({
      table: 'file_downloads',
      values: [{
        ipfs_hash: hash,
        filename: file.filename,
        downloaded_at: new Date()
      }],
      format: 'JSONEachRow'
    });
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Analytics endpoints
app.get('/analytics/user-activity', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, userId } = req.query;

    let query = `
      SELECT
        event_type,
        count() as count,
        toStartOfHour(timestamp) as hour
      FROM user_events
      WHERE timestamp >= parseDateTimeBestEffort('${startDate || '2024-01-01'}')
        AND timestamp <= parseDateTimeBestEffort('${endDate || '2025-12-31'}')
    `;

    if (userId) {
      query += ` AND user_id = '${userId}'`;
    }

    query += `
      GROUP BY event_type, hour
      ORDER BY hour, event_type
    `;

    const result = await clickhouse.query({
      query,
      format: 'JSONEachRow'
    });

    const data = await result.json();
    res.json(data);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

app.get('/analytics/challenge-stats', async (req: Request, res: Response) => {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT
          challenge_id,
          count() as completions,
          avg(score) as avg_score,
          min(score) as min_score,
          max(score) as max_score,
          avg(time_taken) as avg_time,
          language
        FROM challenge_completions
        GROUP BY challenge_id, language
        ORDER BY completions DESC
      `,
      format: 'JSONEachRow'
    });

    const data = await result.json();
    res.json(data);
  } catch (error) {
    console.error('Challenge stats error:', error);
    res.status(500).json({ error: 'Failed to fetch challenge stats' });
  }
});

// Anti-cheat anomaly detection endpoints
app.get('/analytics/anomalies', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { timeWindowHours = 24, minConfidence = 0.7 } = req.query;

    const anomalies = await anomalyDetector.detectSubmissionAnomalies(
      parseInt(timeWindowHours as string),
      parseFloat(minConfidence as string)
    );

    res.json({
      totalAnomalies: anomalies.length,
      anomalies: anomalies.slice(0, 100), // Limit results
      timeWindow: `${timeWindowHours} hours`,
      minConfidence: minConfidence
    });
  } catch (error) {
    console.error('Anomaly detection error:', error);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

app.get('/analytics/anomalies/api-abuse', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { timeWindowHours = 1 } = req.query;

    const anomalies = await anomalyDetector.detectApiAbuseAnomalies(
      parseInt(timeWindowHours as string)
    );

    res.json({
      totalAnomalies: anomalies.length,
      anomalies,
      timeWindow: `${timeWindowHours} hours`
    });
  } catch (error) {
    console.error('API abuse detection error:', error);
    res.status(500).json({ error: 'Failed to detect API abuse' });
  }
});

app.get('/analytics/anti-cheat-report', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { timeWindowHours = 24 } = req.query;

    const report = await anomalyDetector.generateAntiCheatReport(
      parseInt(timeWindowHours as string)
    );

    res.json({
      generatedAt: new Date().toISOString(),
      timeWindow: `${timeWindowHours} hours`,
      ...report
    });
  } catch (error) {
    console.error('Anti-cheat report error:', error);
    res.status(500).json({ error: 'Failed to generate anti-cheat report' });
  }
});

// Cache management
app.post('/cache/set', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { key, value, ttl } = req.body;

    if (ttl) {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
    } else {
      await redisClient.set(key, JSON.stringify(value));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Cache set error:', error);
    res.status(500).json({ error: 'Failed to set cache' });
  }
});

app.get('/cache/get/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const value = await redisClient.get(key);

    if (!value) {
      return res.status(404).json({ error: 'Cache key not found' });
    }

    res.json(JSON.parse(value));
  } catch (error) {
    console.error('Cache get error:', error);
    res.status(500).json({ error: 'Failed to get cache' });
  }
});

// Session management
app.post('/session/create', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId, data, ttl = 3600 } = req.body; // 1 hour default
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await redisClient.setEx(`session:${sessionId}`, ttl, JSON.stringify({
      userId,
      data,
      createdAt: new Date().toISOString()
    }));

    res.json({ sessionId });
  } catch (error) {
    console.error('Session create error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const sessionData = await redisClient.get(`session:${sessionId}`);

    if (!sessionData) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(JSON.parse(sessionData));
  } catch (error) {
    console.error('Session get error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Rate limiting status
app.get('/rate-limit/status/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const key = `ratelimit:${userId}`;

    const requests = await redisClient.get(key);
    const ttl = await redisClient.ttl(key);

    res.json({
      userId,
      currentRequests: parseInt(requests || '0'),
      ttl,
      limit: 100, // requests per window
      windowMs: 15 * 60 * 1000 // 15 minutes
    });
  } catch (error) {
    console.error('Rate limit status error:', error);
    res.status(500).json({ error: 'Failed to get rate limit status' });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    service: 'storage-service',
    timestamp: new Date().toISOString(),
    databases: {
      postgres: 'connected',
      redis: 'connected',
      clickhouse: 'connected',
      // ipfs: 'connected'
    },
    features: {
      anomalyDetection: 'enabled',
      fileStorage: 'enabled',
      caching: 'enabled',
      analytics: 'enabled'
    }
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down storage service...');
  try {
    await postgresClient.end();
    await redisClient.disconnect();
    await clickhouse.close();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Storage Service running on port ${PORT}`);
});