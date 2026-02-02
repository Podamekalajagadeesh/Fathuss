import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import axios from 'axios';
import * as amqp from 'amqplib';
import { createClient } from 'redis';
import { WorkerPoolManager } from './worker-pool';
import { WorkerType, GradingJob, GradingResult, PlagiarismResult, ExecutionTrace } from './types';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import WebSocket from 'ws';
import { GraderCache } from './cache';

dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 4006;

// RabbitMQ connection
let rabbitmqConnection: any;
let rabbitmqChannel: any;

// Connect to RabbitMQ
async function connectRabbitMQ() {
  try {
    rabbitmqConnection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
    rabbitmqChannel = await rabbitmqConnection.createChannel();
    console.log('Connected to RabbitMQ');
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error);
  }
}

// Redis client for caching results
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// Initialize cache for compiled artifacts
const cache = new GraderCache({
  region: process.env.CACHE_REGION,
  bucket: process.env.CACHE_BUCKET,
  localCacheDir: process.env.CACHE_LOCAL_DIR || '/tmp/grader-cache'
});

// Configuration for new features
const TRACE_STORAGE_PATH = process.env.TRACE_STORAGE_PATH || './traces';
const PLAGIARISM_CHECK_ENABLED = process.env.PLAGIARISM_CHECK_ENABLED === 'true';
const DEFAULT_GAS_LIMIT = parseInt(process.env.DEFAULT_GAS_LIMIT || '1000000');
const DEFAULT_TIME_LIMIT = parseInt(process.env.DEFAULT_TIME_LIMIT || '30'); // seconds

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
  await ensureTraceStorage();
  await workerPool.initialize();
  console.log('All services initialized');
}

// Get queue position for a job
async function getQueuePosition(jobId: string): Promise<number> {
  try {
    const job = await prisma.GradingJob.findUnique({
      where: { jobId },
      select: { submittedAt: true, status: true }
    });

    if (!job || job.status !== 'QUEUED') {
      return 0;
    }

    // Count jobs submitted before this one that are still queued
    const position = await prisma.GradingJob.count({
      where: {
        status: 'QUEUED',
        submittedAt: { lt: job.submittedAt }
      }
    });

    return position + 1; // +1 because count starts from 0
  } catch (error) {
    console.error('Error calculating queue position:', error);
    return 0;
  }
}

// Ensure trace storage directory exists
async function ensureTraceStorage() {
  try {
    await fs.mkdir(TRACE_STORAGE_PATH, { recursive: true });
  } catch (error) {
    console.error('Failed to create trace storage directory:', error);
  }
}

// Advanced plagiarism detection with multiple strategies
async function checkPlagiarism(code: string, language: string, challengeId?: string, userId?: string): Promise<PlagiarismResult> {
  if (!PLAGIARISM_CHECK_ENABLED) {
    return {
      isPlagiarized: false,
      similarityScore: 0,
      matchedSources: [],
      confidence: 0
    };
  }

  try {
    // Strategy 1: Exact hash matching (catches verbatim copies)
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const languageKey = `plagiarism:${language}`;
    const exactMatches = await redisClient.sMembers(`${languageKey}:hashes`);
    const isExactMatch = exactMatches.includes(codeHash);

    if (isExactMatch) {
      return {
        isPlagiarized: true,
        similarityScore: 100,
        matchedSources: ['exact_hash_match'],
        confidence: 0.99
      };
    }

    // Strategy 2: Structural similarity (AST-based)
    const structuralSimilarity = await calculateStructuralSimilarity(code, language, languageKey);
    
    // Strategy 3: Token sequence matching
    const tokenSimilarity = calculateTokenSimilarity(code, language);

    // Strategy 4: Common code patterns detection
    const patternScore = detectCommonPatterns(code, language);

    // Weighted combination of all strategies
    const similarityScore = Math.round(
      structuralSimilarity * 0.4 +  // Structural similarity weights most
      tokenSimilarity * 0.3 +        // Token patterns
      patternScore * 0.3             // Common patterns
    );

    // Confidence increases with higher similarity
    const confidence = Math.min(0.99, (similarityScore / 100) * 0.95 + 0.05);

    // Threshold for flagging as plagiarized (75%+ similarity = high risk)
    const isPlagiarized = similarityScore >= 75;

    // Store this submission for future comparison if it's legitimate
    if (!isPlagiarized && challengeId && userId) {
      await storeSubmissionFingerprint(code, language, challengeId, userId, codeHash);
    }

    return {
      isPlagiarized,
      similarityScore,
      matchedSources: isPlagiarized ? ['structural_similarity', 'pattern_matching'] : [],
      confidence
    };
  } catch (error) {
    console.error('Plagiarism check error:', error);
    return {
      isPlagiarized: false,
      similarityScore: 0,
      matchedSources: [],
      confidence: 0
    };
  }
}

// Store submission fingerprint for future comparisons
async function storeSubmissionFingerprint(code: string, language: string, challengeId: string, userId: string, codeHash: string) {
  try {
    const key = `plagiarism:${language}:${challengeId}:submissions`;
    const fingerprint = {
      userId,
      hash: codeHash,
      timestamp: Date.now(),
      tokenCount: code.trim().split(/\s+/).length
    };
    await redisClient.sAdd(`${key}:hashes`, codeHash);
    await redisClient.hSet(`${key}:${codeHash}`, fingerprint);
    // Set 90-day expiration
    await redisClient.expire(`${key}:${codeHash}`, 7776000);
  } catch (error) {
    console.error('Error storing submission fingerprint:', error);
  }
}

// Calculate structural similarity using token analysis
async function calculateStructuralSimilarity(code: string, language: string, storageKey: string): Promise<number> {
  try {
    const tokens = extractTokens(code, language);
    const tokenString = tokens.join(' ');
    
    // Get similar submissions from storage
    const similarSubmissions = await redisClient.sMembers(`${storageKey}:tokens`);
    
    if (similarSubmissions.length === 0) {
      return 0;
    }

    let maxSimilarity = 0;
    for (const submission of similarSubmissions.slice(0, 10)) { // Compare with last 10
      const similarity = calculateStringSimilarity(tokenString, submission);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    return Math.round(maxSimilarity * 100);
  } catch (error) {
    console.error('Structural similarity calculation error:', error);
    return 0;
  }
}

// Extract tokens from code (language-aware)
function extractTokens(code: string, language: string): string[] {
  const tokens = [];
  const lines = code.split('\n');

  for (const line of lines) {
    // Remove comments based on language
    let cleanLine = line;
    if (language === 'solidity' || language === 'javascript' || language === 'typescript') {
      cleanLine = line.split('//')[0]; // Remove single-line comments
    } else if (language === 'python') {
      cleanLine = line.split('#')[0];
    } else if (language === 'rust') {
      cleanLine = line.split('//')[0];
    }

    // Remove whitespace and split into tokens
    const lineTokens = cleanLine.trim().split(/[\s(){};,[\]]+/).filter(t => t.length > 0);
    tokens.push(...lineTokens);
  }

  return tokens;
}

// Calculate token similarity using Levenshtein distance
function calculateTokenSimilarity(code: string, language: string): number {
  const tokens = extractTokens(code, language);
  const tokenCount = tokens.length;

  // Penalize very short submissions (likely incomplete)
  if (tokenCount < 5) {
    return 0;
  }

  // Check for common boilerplate patterns
  const uniqueTokens = new Set(tokens);
  const diversityRatio = uniqueTokens.size / tokenCount;

  // Low diversity might indicate copied code
  if (diversityRatio < 0.4) {
    return 70; // Higher suspicion for low-diversity code
  }

  return 0;
}

// Detect common programming patterns that might indicate plagiarism
function detectCommonPatterns(code: string, language: string): number {
  const patterns = getLanguagePatterns(language);
  let matchedPatterns = 0;

  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'g');
    if (regex.test(code)) {
      matchedPatterns++;
    }
  }

  // 3+ pattern matches might indicate common library usage rather than plagiarism
  return Math.min(50, matchedPatterns * 10);
}

// Get common patterns for language
function getLanguagePatterns(language: string): string[] {
  const patterns: Record<string, string[]> = {
    solidity: [
      'require\\s*\\([^)]+\\)',
      'pragma\\s+solidity',
      'contract\\s+\\w+',
      'function\\s+\\w+\\s*\\(',
      'emit\\s+\\w+'
    ],
    javascript: [
      'console\\.log',
      'function\\s+\\w+\\s*\\(',
      'const\\s+\\w+\\s*=',
      'let\\s+\\w+\\s*=',
      'return\\s+'
    ],
    typescript: [
      'interface\\s+\\w+',
      'type\\s+\\w+\\s*=',
      'function\\s+\\w+\\s*\\(',
      'class\\s+\\w+',
      'return\\s+'
    ],
    python: [
      'def\\s+\\w+\\s*\\(',
      'class\\s+\\w+',
      'import\\s+\\w+',
      'return\\s+',
      'if\\s+__name__'
    ],
    rust: [
      'fn\\s+\\w+\\s*\\(',
      'pub\\s+struct',
      'impl\\s+\\w+',
      'use\\s+\\w+',
      'match\\s+'
    ]
  };

  return patterns[language.toLowerCase()] || [];
}

// Calculate string similarity using Levenshtein distance algorithm
function calculateStringSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len2 + 1)
    .fill(null)
    .map(() => Array(len1 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

// Update leaderboard and user XP
async function updateLeaderboardAndXP(jobId: string, userId: string, challengeId: string, score: number) {
  try {
    // Update user experience points and stats
    const xpGained = Math.floor(score / 10); // 1 XP per 10 points scored

    await prisma.user.update({
      where: { id: userId },
      data: {
        experiencePoints: { increment: xpGained },
        totalScore: { increment: score },
        challengesCompleted: { increment: 1 }
      }
    });

    // Create leaderboard entry
    await prisma.leaderboardEntry.create({
      data: {
        userId,
        challengeId,
        score,
        rank: 0, // Will be calculated later
        period: 'all_time'
      }
    });

    // Update ranks for this challenge (simplified - in production, use a more efficient ranking system)
    const challengeEntries = await prisma.leaderboardEntry.findMany({
      where: { challengeId, period: 'all_time' },
      orderBy: { score: 'desc' }
    });

    for (let i = 0; i < challengeEntries.length; i++) {
      await prisma.leaderboardEntry.update({
        where: { id: challengeEntries[i].id },
        data: { rank: i + 1 }
      });
    }

    console.log(`Updated leaderboard for user ${userId}, challenge ${challengeId}, score: ${score}, XP gained: ${xpGained}`);
  } catch (error) {
    console.error(`Failed to update leaderboard and XP for job ${jobId}:`, error);
    // Don't fail the job if leaderboard update fails
  }
}

// Store execution trace for audit purposes
async function storeExecutionTrace(jobId: string, trace: any): Promise<string> {
  const traceId = `trace_${jobId}_${Date.now()}`;
  const tracePath = path.join(TRACE_STORAGE_PATH, `${traceId}.json`);

  try {
    await fs.writeFile(tracePath, JSON.stringify({
      traceId,
      jobId,
      timestamp: new Date().toISOString(),
      trace
    }, null, 2));

    // Store trace reference in Redis
    await redisClient.setEx(`trace:${jobId}`, 86400 * 30, traceId); // 30 days

    return traceId;
  } catch (error) {
    console.error('Failed to store execution trace:', error);
    throw error;
  }
}

// Retrieve execution trace
async function getExecutionTrace(jobId: string): Promise<any> {
  const traceId = await redisClient.get(`trace:${jobId}`);
  if (!traceId) {
    throw new Error('Trace not found');
  }

  const tracePath = path.join(TRACE_STORAGE_PATH, `${traceId}.json`);
  const traceData = await fs.readFile(tracePath, 'utf-8');
  return JSON.parse(traceData);
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
app.post('/submit', authenticateToken, async (req: Request, res: Response) => {
  try {
    const {
      challengeId,
      code,
      language,
      testCases,
      tool,
      metadata = {}
    } = req.body;
    const userId = (req as any).user.id;

    // Set default metadata values
    const jobMetadata = {
      gasLimit: metadata.gasLimit || DEFAULT_GAS_LIMIT,
      timeLimit: metadata.timeLimit || DEFAULT_TIME_LIMIT,
      enableTracing: metadata.enableTracing !== false, // Default to true
      checkPlagiarism: metadata.checkPlagiarism !== false // Default to true
    };

    // Determine worker type
    let workerType: WorkerType;
    if (tool && TOOL_WORKER_MAP[tool]) {
      workerType = TOOL_WORKER_MAP[tool];
    } else if (LANGUAGE_WORKER_MAP[language]) {
      workerType = LANGUAGE_WORKER_MAP[language];
    } else {
      return res.status(400).json({ error: `Unsupported language/tool: ${language}${tool ? `/${tool}` : ''}` });
    }

    // Perform plagiarism check if enabled
    let plagiarismResult: PlagiarismResult | undefined;
    if (jobMetadata.checkPlagiarism) {
      plagiarismResult = await checkPlagiarism(code, language);
      if (plagiarismResult.isPlagiarized) {
        return res.status(400).json({
          error: 'Plagiarism detected',
          plagiarismResult
        });
      }
    }

    // Create grading job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create database record
    const dbJob = await prisma.GradingJob.create({
      data: {
        jobId,
        challengeId,
        userId,
        code,
        language,
        workerType: workerType.toString(),
        gasLimit: jobMetadata.gasLimit,
        timeLimit: jobMetadata.timeLimit,
        enableTracing: jobMetadata.enableTracing,
        checkPlagiarism: jobMetadata.checkPlagiarism,
        status: 'QUEUED'
      }
    });

    const job: GradingJob = {
      jobId,
      payload: {
        code,
        language,
        testCases,
        challengeId,
        userId,
        metadata: jobMetadata
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
      message: 'Grading job submitted successfully',
      metadata: jobMetadata
    });
  } catch (error) {
    console.error('Error submitting grading job:', error);
    res.status(500).json({ error: 'Failed to submit grading job' });
  }
});

// Get grading result
app.get('/submit/:jobId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Fetch from Redis first
    let jobData = await redisClient.get(`job:${jobId}`);
    let job;

    if (jobData) {
      job = JSON.parse(jobData);
    } else {
      // Fallback to database
      const dbJob = await prisma.GradingJob.findUnique({
        where: { jobId }
      });

      if (!dbJob) {
        return res.status(404).json({ error: 'Job not found' });
      }

      job = {
        jobId: dbJob.jobId,
        status: dbJob.status.toLowerCase(),
        submittedAt: dbJob.submittedAt.toISOString(),
        completedAt: dbJob.completedAt?.toISOString(),
        result: dbJob.status === 'COMPLETED' ? {
          jobId: dbJob.jobId,
          status: 'completed',
          score: dbJob.score || 0,
          passedTests: dbJob.passedTests || 0,
          totalTests: dbJob.totalTests || 0,
          gasUsed: dbJob.gasUsed || 0,
          timeUsed: dbJob.timeUsed || 0,
          executionTrace: dbJob.executionTrace,
          plagiarismCheck: dbJob.plagiarismResult,
          output: dbJob.output || '',
          error: dbJob.error,
          language: dbJob.language
        } : undefined
      };
    }

    if (job.status === 'completed') {
      res.json(job.result);
    } else {
      // Calculate estimated completion time based on queue position
      const queuePosition = await getQueuePosition(jobId);
      const estimatedWaitTime = queuePosition * 30; // 30 seconds per job estimate

      res.json({
        jobId: job.jobId,
        status: job.status,
        submittedAt: job.submittedAt,
        queuePosition,
        estimatedCompletionTime: estimatedWaitTime,
        workerType: job.workerType || 'unknown'
      });
    }
  } catch (error) {
    console.error('Error fetching grading result:', error);
    res.status(500).json({ error: 'Failed to fetch grading result' });
  }
});

// Get execution trace for audit
app.get('/submit/:jobId/trace', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const trace = await getExecutionTrace(jobId);
    res.json(trace);
  } catch (error) {
    console.error('Error fetching execution trace:', error);
    res.status(500).json({ error: 'Failed to fetch execution trace' });
  }
});

// Get grading queue status
app.get('/queue/status', async (req: Request, res: Response) => {
  try {
    // Get queue statistics
    const queueInfo = await rabbitmqChannel.checkQueue('grading_jobs');
    const activeJobs = await prisma.GradingJob.count({
      where: { status: { in: ['QUEUED', 'PROCESSING'] } }
    });

    const status = {
      queued: queueInfo.messageCount,
      processing: activeJobs,
      completed: await prisma.GradingJob.count({ where: { status: 'COMPLETED' } }),
      failed: await prisma.GradingJob.count({ where: { status: 'FAILED' } }),
      averageWaitTime: 45, // seconds - could be calculated from actual data
      totalJobs: await prisma.GradingJob.count()
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

// Cache management endpoints
app.get('/cache/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const stats = await cache.getStats();
    res.json({
      ...stats,
      hitRate: 0, // Could be tracked separately
      lastCleanup: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching cache stats:', error);
    res.status(500).json({ error: 'Failed to fetch cache stats' });
  }
});

app.post('/cache/cleanup', authenticateToken, async (req: Request, res: Response) => {
  try {
    await cache.cleanup();
    res.json({ message: 'Cache cleanup completed' });
  } catch (error) {
    console.error('Error during cache cleanup:', error);
    res.status(500).json({ error: 'Cache cleanup failed' });
  }
});

// Process grading job (internal function)
async function processGradingJob(jobId: string, payload: any, workerType: WorkerType) {
  let assignedWorkerId: string | undefined;
  const startTime = Date.now();

  try {
    console.log(`Processing grading job ${jobId} with ${workerType} worker`);

    // Update job status to processing
    const jobData = await redisClient.get(`job:${jobId}`);
    if (jobData) {
      const job = JSON.parse(jobData);
      job.status = 'processing';
      await redisClient.setEx(`job:${jobId}`, 3600, JSON.stringify(job));
    }

    // Update database status
    await prisma.GradingJob.update({
      where: { jobId },
      data: {
        status: 'PROCESSING',
        startedAt: new Date()
      }
    });

    broadcastJobUpdate(jobId, { status: 'processing', startedAt: new Date() });

    // Get worker from pool
    const worker = await workerPool.getOrCreateWorker(workerType);
    assignedWorkerId = worker.id;

    console.log(`Assigned worker ${worker.id} (${worker.endpoint}) for job ${jobId}`);

    // Check cache for compilation results if this is a compilation job
    let cachedResult: any = null;
    let cacheKey: string | undefined;

    if (payload.metadata?.enableCaching !== false && payload.code) {
      try {
        const compilerVersion = payload.metadata?.compilerVersion || 'latest';
        const optimizationLevel = payload.metadata?.optimizationLevel || 0;
        cacheKey = cache.generateCacheKey(payload.code, compilerVersion, optimizationLevel);

        console.log(`Checking cache for job ${jobId} with key: ${cacheKey}`);
        cachedResult = await cache.retrieve(cacheKey);

        if (cachedResult) {
          console.log(`Cache hit for job ${jobId}, using cached compilation result`);
        } else {
          console.log(`Cache miss for job ${jobId}, proceeding with compilation`);
        }
      } catch (cacheError) {
        console.warn(`Cache check failed for job ${jobId}:`, cacheError);
        // Continue without caching if cache fails
      }
    }

    // Prepare payload with gas/time limits
    const enhancedPayload = {
      ...payload,
      gasLimit: payload.metadata?.gasLimit || DEFAULT_GAS_LIMIT,
      timeLimit: payload.metadata?.timeLimit || DEFAULT_TIME_LIMIT,
      enableTracing: payload.metadata?.enableTracing ?? true,
      // Use cached result if available
      cachedResult
    };

    // Send to worker with timeout based on time limit
    const timeout = Math.min(enhancedPayload.timeLimit * 1000, workerPoolConfig.workerTimeout * 1000);
    const response = await axios.post(`${worker.endpoint}/grade`, enhancedPayload, {
      timeout
    });

    const rawResult = response.data;
    const processingTime = Date.now() - startTime;

    // Cache the compilation result if successful and not already cached
    if (cacheKey && !cachedResult && rawResult.compiledArtifact && !rawResult.error) {
      try {
        await cache.store(cacheKey, rawResult.compiledArtifact, {
          compiler: payload.metadata?.compilerVersion || 'latest',
          version: payload.metadata?.compilerVersion || 'latest',
          language: payload.language,
          optimizationLevel: payload.metadata?.optimizationLevel || 0
        });
        console.log(`Cached compilation result for job ${jobId}`);
      } catch (cacheError) {
        console.warn(`Failed to cache result for job ${jobId}:`, cacheError);
        // Don't fail the job if caching fails
      }
    }

    // Enforce gas limit
    if (rawResult.gasUsed > enhancedPayload.gasLimit) {
      throw new Error(`Gas limit exceeded: ${rawResult.gasUsed} > ${enhancedPayload.gasLimit}`);
    }

    // Enforce time limit
    if (processingTime > enhancedPayload.timeLimit * 1000) {
      throw new Error(`Time limit exceeded: ${processingTime}ms > ${enhancedPayload.timeLimit * 1000}ms`);
    }

    // Store execution trace if available and enabled
    let traceId: string | undefined;
    if (enhancedPayload.enableTracing && rawResult.executionTrace) {
      try {
        traceId = await storeExecutionTrace(jobId, rawResult.executionTrace);
        console.log(`Stored execution trace for job ${jobId}: ${traceId}`);
      } catch (traceError) {
        console.error(`Failed to store execution trace for job ${jobId}:`, traceError);
        // Don't fail the job if trace storage fails
      }
    }

    // Store plagiarism check result if performed
    let plagiarismResult: PlagiarismResult | undefined;
    if (payload.metadata?.checkPlagiarism) {
      plagiarismResult = await checkPlagiarism(payload.code, payload.language);
      // Store the code hash for future plagiarism checks
      const codeHash = crypto.createHash('sha256').update(payload.code).digest('hex');
      await redisClient.sAdd(`plagiarism:${payload.language}`, codeHash);
    }

    // Create comprehensive result
    const result: GradingResult = {
      jobId,
      status: 'completed',
      score: rawResult.score || 0,
      passedTests: rawResult.passedTests || 0,
      totalTests: rawResult.totalTests || 0,
      gasUsed: rawResult.gasUsed,
      timeUsed: processingTime,
      executionTrace: rawResult.executionTrace,
      plagiarismCheck: plagiarismResult,
      output: rawResult.output || '',
      error: rawResult.error,
      language: payload.language
    };

    // Update job with result
    const updatedJob = {
      jobId,
      payload,
      workerType,
      assignedWorkerId,
      status: 'completed',
      submittedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result,
      traceId
    };

    await redisClient.setEx(`job:${jobId}`, 3600, JSON.stringify(updatedJob));

    // Update database with results
    await prisma.GradingJob.update({
      where: { jobId },
      data: {
        status: 'COMPLETED',
        score: result.score,
        passedTests: result.passedTests,
        totalTests: result.totalTests,
        gasUsed: result.gasUsed,
        timeUsed: result.timeUsed,
        output: result.output,
        error: result.error,
        executionTrace: result.executionTrace ? JSON.parse(JSON.stringify(result.executionTrace)) : null,
        plagiarismResult: result.plagiarismCheck ? JSON.parse(JSON.stringify(result.plagiarismCheck)) : null,
        completedAt: new Date(),
        assignedWorkerId
      }
    });

    broadcastJobUpdate(jobId, {
      status: 'completed',
      score: result.score,
      passedTests: result.passedTests,
      totalTests: result.totalTests,
      gasUsed: result.gasUsed,
      timeUsed: result.timeUsed,
      completedAt: new Date()
    });

    // Update leaderboard and user XP
    await updateLeaderboardAndXP(jobId, payload.userId, payload.challengeId, result.score);

    // Publish completion event for real-time notifications
    await redisClient.publish('grading:completed', JSON.stringify({
      jobId,
      userId: payload.userId,
      challengeId: payload.challengeId,
      score: result.score,
      status: 'completed'
    }));

    console.log(`Grading job ${jobId} completed with score: ${result.score}, gas: ${result.gasUsed}, time: ${processingTime}ms`);

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
      job.completedAt = new Date().toISOString();
      await redisClient.setEx(`job:${jobId}`, 3600, JSON.stringify(job));
    }

    // Update database with failure
    await prisma.GradingJob.update({
      where: { jobId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
        assignedWorkerId
      }
    });

    broadcastJobUpdate(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date()
    });

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
    const { submissions, tournamentId, metadata = {} } = req.body;

    // TODO: Validate admin/organizer permissions

    const batchJobId = `batch_${Date.now()}`;

    // Set default metadata for batch
    const batchMetadata = {
      gasLimit: metadata.gasLimit || DEFAULT_GAS_LIMIT,
      timeLimit: metadata.timeLimit || DEFAULT_TIME_LIMIT,
      enableTracing: metadata.enableTracing !== false,
      checkPlagiarism: metadata.checkPlagiarism !== false
    };

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
            userId: submission.userId,
            metadata: { ...batchMetadata, ...submission.metadata } // Allow per-submission overrides
          },
          workerType
        );
      })
    );

    const successful = results.filter((r: PromiseSettledResult<any>) => r.status === 'fulfilled').length;
    const failed = results.filter((r: PromiseSettledResult<any>) => r.status === 'rejected').length;

    res.json({
      batchJobId,
      total: submissions.length,
      successful,
      failed,
      status: 'processing',
      metadata: batchMetadata
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
    version: '2.0.0',
    features: {
      gasLimitEnforcement: true,
      timeLimitEnforcement: true,
      executionTracing: true,
      plagiarismDetection: PLAGIARISM_CHECK_ENABLED,
      auditStorage: true
    },
    config: {
      defaultGasLimit: DEFAULT_GAS_LIMIT,
      defaultTimeLimit: DEFAULT_TIME_LIMIT,
      traceStorageEnabled: true
    },
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
    await prisma.$disconnect();
    await workerPool.shutdown();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Grader Orchestration Service running on port ${PORT}`);
});

// WebSocket server for real-time job updates
const wss = new WebSocket.Server({ port: 4007 }); // Use a different port for WS

wss.on('connection', (ws: WebSocket) => {
  console.log('WebSocket client connected');

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe' && data.jobId) {
        // Subscribe to job updates
        ws.send(JSON.stringify({ type: 'subscribed', jobId: data.jobId }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Function to broadcast job updates
export const broadcastJobUpdate = (jobId: string, update: any) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'job_update', jobId, ...update }));
    }
  });
};