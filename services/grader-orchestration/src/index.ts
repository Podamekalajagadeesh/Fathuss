import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import axios from 'axios';
import * as amqp from 'amqplib';
import { createClient } from 'redis';
import { WorkerPoolManager } from './worker-pool';
import { WorkerType, GradingJob } from './types';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4006;

// RabbitMQ connection
let rabbitmqConnection: amqp.Connection;
let rabbitmqChannel: amqp.Channel;

// Redis client for caching results
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// Worker pool manager
const workerPoolConfig = {
  maxWorkers: parseInt(process.env.MAX_WORKERS || '10'),
  workerTimeout: parseInt(process.env.WORKER_TIMEOUT || '300'), // 5 minutes
  healthCheckInterval: 30000, // 30 seconds
  dockerImage: process.env.WORKER_DOCKER_IMAGE || 'fathuss/worker:latest',
  firecrackerEnabled: process.env.FIRECRACKER_ENABLED === 'true'
};

const workerPool = new WorkerPoolManager(workerPoolConfig);

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

// Initialize RabbitMQ
async function initRabbitMQ() {
  try {
    const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    rabbitmqConnection = await amqp.connect(rabbitmqUrl);
    rabbitmqChannel = await rabbitmqConnection.createChannel();

    // Declare queue for grading jobs
    await rabbitmqChannel.assertQueue('grading_jobs', { durable: true });

    // Start consumer
    rabbitmqChannel.consume('grading_jobs', async (msg: amqp.ConsumeMessage | null) => {
      if (msg) {
        try {
          const job = JSON.parse(msg.content.toString());
          await processGradingJob(job.jobId, job.payload, job.workerType);
          rabbitmqChannel.ack(msg);
        } catch (error) {
          console.error('Error processing message:', error);
          rabbitmqChannel.nack(msg, false, false); // Don't requeue
        }
      }
    });

    console.log('RabbitMQ initialized and consumer started');
  } catch (error) {
    console.error('Failed to initialize RabbitMQ:', error);
  }
}

// Initialize services
async function initializeServices() {
  await initRabbitMQ();
  await workerPool.initialize();
  console.log('All services initialized');
}

initializeServices();

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

// Language to worker type mapping
const LANGUAGE_WORKER_MAP: Record<string, WorkerType> = {
  solidity: WorkerType.COMPILER_FOUNDRY, // Default to Foundry, could be configurable
  rust: WorkerType.GRADER_RUST,
  javascript: WorkerType.GRADER_RUST, // Use Rust grader for JS
  python: WorkerType.GRADER_RUST, // Use Rust grader for Python
  move: WorkerType.COMPILER_MOVE
};

// Tool-specific mappings for advanced users
const TOOL_WORKER_MAP: Record<string, WorkerType> = {
  foundry: WorkerType.COMPILER_FOUNDRY,
  anvil: WorkerType.COMPILER_FOUNDRY,
  hardhat: WorkerType.COMPILER_HARDHAT,
  cargo: WorkerType.COMPILER_CARGO,
  'move-cli': WorkerType.COMPILER_MOVE
};

// Submit code for grading
app.post('/grade', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { challengeId, code, language, testCases, tool } = req.body;
    const userId = (req as any).user.id;

    // Determine worker type
    let workerType: WorkerType;
    if (tool && TOOL_WORKER_MAP[tool]) {
      workerType = TOOL_WORKER_MAP[tool];
    } else if (LANGUAGE_WORKER_MAP[language]) {
      workerType = LANGUAGE_WORKER_MAP[language];
    } else {
      return res.status(400).json({ error: `Unsupported language/tool: ${language}${tool ? `/${tool}` : ''}` });
    }

    // Create grading job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const job: GradingJob = {
      jobId,
      payload: {
        code,
        language,
        testCases,
        challengeId,
        userId
      },
      workerType,
      status: 'queued',
      submittedAt: new Date()
    };

    // Store job status in Redis
    await redisClient.setEx(`job:${jobId}`, 3600, JSON.stringify(job)); // 1 hour expiry

    // Publish job to RabbitMQ queue
    const message = {
      jobId,
      payload: job.payload,
      workerType
    };

    rabbitmqChannel.sendToQueue('grading_jobs', Buffer.from(JSON.stringify(message)), { persistent: true });

    res.json({
      jobId,
      status: 'queued',
      message: 'Grading job submitted successfully'
    });
  } catch (error) {
    console.error('Error submitting grading job:', error);
    res.status(500).json({ error: 'Failed to submit grading job' });
  }
});

// Get grading result
app.get('/grade/:jobId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Fetch from Redis
    const jobData = await redisClient.get(`job:${jobId}`);
    if (!jobData) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = JSON.parse(jobData);

    if (job.status === 'completed') {
      res.json(job.result);
    } else {
      res.json({
        jobId: job.id,
        status: job.status,
        submittedAt: job.submittedAt
      });
    }
  } catch (error) {
    console.error('Error fetching grading result:', error);
    res.status(500).json({ error: 'Failed to fetch grading result' });
  }
});

// Get grading queue status
app.get('/queue/status', async (req: Request, res: Response) => {
  try {
    // TODO: Get actual queue status
    const status = {
      queued: 5,
      processing: 2,
      completed: 150,
      failed: 3,
      averageWaitTime: 45 // seconds
    };

    res.json(status);
  } catch (error) {
    console.error('Error fetching queue status:', error);
    res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

// Admin endpoint to manage workers
app.get('/workers/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const workerStats = workerPool.getWorkerStats();

    // Get detailed worker info
    const workers = Array.from(workerPool['workers'].values()).map(worker => ({
      id: worker.id,
      type: worker.type,
      status: worker.status,
      endpoint: worker.endpoint,
      createdAt: worker.createdAt,
      lastUsedAt: worker.lastUsedAt,
      capabilities: worker.capabilities
    }));

    res.json({
      stats: workerStats,
      workers,
      config: workerPoolConfig
    });
  } catch (error) {
    console.error('Error fetching worker status:', error);
    res.status(500).json({ error: 'Failed to fetch worker status' });
  }
});

// Process grading job (internal function)
async function processGradingJob(jobId: string, payload: any, workerType: WorkerType) {
  let assignedWorkerId: string | undefined;

  try {
    console.log(`Processing grading job ${jobId} with ${workerType} worker`);

    // Update job status to processing
    const jobData = await redisClient.get(`job:${jobId}`);
    if (jobData) {
      const job = JSON.parse(jobData);
      job.status = 'processing';
      await redisClient.setEx(`job:${jobId}`, 3600, JSON.stringify(job));
    }

    // Get worker from pool
    const worker = await workerPool.getOrCreateWorker(workerType);
    assignedWorkerId = worker.id;

    console.log(`Assigned worker ${worker.id} (${worker.endpoint}) for job ${jobId}`);

    // Send to worker
    const response = await axios.post(`${worker.endpoint}/grade`, payload, {
      timeout: workerPoolConfig.workerTimeout * 1000
    });

    const result = response.data;

    // Update job with result
    const updatedJob = {
      jobId,
      payload,
      workerType,
      assignedWorkerId,
      status: 'completed',
      submittedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: {
        jobId,
        status: 'completed',
        ...result
      }
    };

    await redisClient.setEx(`job:${jobId}`, 3600, JSON.stringify(updatedJob));

    console.log(`Grading job ${jobId} completed with score: ${result.score}`);

    // TODO: Update leaderboard
    // TODO: Send notification to user

  } catch (error) {
    console.error(`Error processing grading job ${jobId}:`, error);

    // Mark job as failed
    const jobData = await redisClient.get(`job:${jobId}`);
    if (jobData) {
      const job = JSON.parse(jobData);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.assignedWorkerId = assignedWorkerId;
      await redisClient.setEx(`job:${jobId}`, 3600, JSON.stringify(job));
    }

    // TODO: Retry logic or dead letter queue
  } finally {
    // Release worker back to pool
    if (assignedWorkerId) {
      try {
        await workerPool.releaseWorker(assignedWorkerId);
      } catch (releaseError) {
        console.error(`Error releasing worker ${assignedWorkerId}:`, releaseError);
      }
    }
  }
}

// Batch grading for tournaments/competitions
app.post('/grade/batch', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { submissions, tournamentId } = req.body;

    // TODO: Validate admin/organizer permissions

    const batchJobId = `batch_${Date.now()}`;

    // Process submissions in parallel with rate limiting
    const results = await Promise.allSettled(
      submissions.map((submission: any) => {
        const workerType = LANGUAGE_WORKER_MAP[submission.language] || WorkerType.GRADER_RUST;
        return processGradingJob(
          `batch_${batchJobId}_${submission.id}`,
          {
            code: submission.code,
            language: submission.language,
            testCases: submission.testCases || [],
            challengeId: submission.challengeId,
            userId: submission.userId
          },
          workerType
        );
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    res.json({
      batchJobId,
      total: submissions.length,
      successful,
      failed,
      status: 'processing'
    });
  } catch (error) {
    console.error('Error processing batch grading:', error);
    res.status(500).json({ error: 'Failed to process batch grading' });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    service: 'grader-orchestration',
    timestamp: new Date().toISOString(),
    workerTypes: Object.values(WorkerType),
    workerStats: workerPool.getWorkerStats()
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try {
    if (rabbitmqChannel) await rabbitmqChannel.close();
    if (rabbitmqConnection) await rabbitmqConnection.close();
    await redisClient.disconnect();
    await workerPool.shutdown();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Grader Orchestration Service running on port ${PORT}`);
});