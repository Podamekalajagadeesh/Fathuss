"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastJobUpdate = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const amqp = __importStar(require("amqplib"));
const redis_1 = require("redis");
const worker_pool_1 = require("./worker-pool");
const types_1 = require("./types");
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const ws_1 = __importDefault(require("ws"));
const cache_1 = require("./cache");
dotenv_1.default.config();
// Initialize Prisma client
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4006;
// RabbitMQ connection
let rabbitmqConnection;
let rabbitmqChannel;
// Connect to RabbitMQ
async function connectRabbitMQ() {
    try {
        rabbitmqConnection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
        rabbitmqChannel = await rabbitmqConnection.createChannel();
        console.log('Connected to RabbitMQ');
    }
    catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
    }
}
// Redis client for caching results
const redisClient = (0, redis_1.createClient)({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);
// Initialize cache for compiled artifacts
const cache = new cache_1.GraderCache({
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
const workerPool = new worker_pool_1.WorkerPoolManager(workerPoolConfig);
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
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
        rabbitmqChannel.consume('grading_jobs', async (msg) => {
            if (msg) {
                try {
                    const job = JSON.parse(msg.content.toString());
                    await processGradingJob(job.jobId, job.payload, job.workerType);
                    rabbitmqChannel.ack(msg);
                }
                catch (error) {
                    console.error('Error processing message:', error);
                    rabbitmqChannel.nack(msg, false, false); // Don't requeue
                }
            }
        });
        console.log('RabbitMQ initialized and consumer started');
    }
    catch (error) {
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
async function getQueuePosition(jobId) {
    try {
        const job = await prisma.gradingJob.findUnique({
            where: { jobId },
            select: { submittedAt: true, status: true }
        });
        if (!job || job.status !== 'QUEUED') {
            return 0;
        }
        // Count jobs submitted before this one that are still queued
        const position = await prisma.gradingJob.count({
            where: {
                status: 'QUEUED',
                submittedAt: { lt: job.submittedAt }
            }
        });
        return position + 1; // +1 because count starts from 0
    }
    catch (error) {
        console.error('Error calculating queue position:', error);
        return 0;
    }
}
// Ensure trace storage directory exists
async function ensureTraceStorage() {
    try {
        await promises_1.default.mkdir(TRACE_STORAGE_PATH, { recursive: true });
    }
    catch (error) {
        console.error('Failed to create trace storage directory:', error);
    }
}
// Plagiarism detection (simplified implementation)
async function checkPlagiarism(code, language) {
    if (!PLAGIARISM_CHECK_ENABLED) {
        return {
            isPlagiarized: false,
            similarityScore: 0,
            matchedSources: [],
            confidence: 0
        };
    }
    // Simple hash-based check against stored submissions
    const codeHash = crypto_1.default.createHash('sha256').update(code).digest('hex');
    const languageKey = `plagiarism:${language}`;
    // Check if hash exists in Redis
    const existingHashes = await redisClient.sMembers(languageKey);
    const isDuplicate = existingHashes.includes(codeHash);
    // Calculate similarity score (simplified - in real implementation, use AST comparison)
    const similarityScore = isDuplicate ? 100 : 0;
    return {
        isPlagiarized: similarityScore > 80,
        similarityScore,
        matchedSources: isDuplicate ? ['previous_submission'] : [],
        confidence: isDuplicate ? 100 : 0
    };
}
// Update leaderboard and user XP
async function updateLeaderboardAndXP(jobId, userId, challengeId, score) {
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
    }
    catch (error) {
        console.error(`Failed to update leaderboard and XP for job ${jobId}:`, error);
        // Don't fail the job if leaderboard update fails
    }
}
// Store execution trace for audit purposes
async function storeExecutionTrace(jobId, trace) {
    const traceId = `trace_${jobId}_${Date.now()}`;
    const tracePath = path_1.default.join(TRACE_STORAGE_PATH, `${traceId}.json`);
    try {
        await promises_1.default.writeFile(tracePath, JSON.stringify({
            traceId,
            jobId,
            timestamp: new Date().toISOString(),
            trace
        }, null, 2));
        // Store trace reference in Redis
        await redisClient.setEx(`trace:${jobId}`, 86400 * 30, traceId); // 30 days
        return traceId;
    }
    catch (error) {
        console.error('Failed to store execution trace:', error);
        throw error;
    }
}
// Retrieve execution trace
async function getExecutionTrace(jobId) {
    const traceId = await redisClient.get(`trace:${jobId}`);
    if (!traceId) {
        throw new Error('Trace not found');
    }
    const tracePath = path_1.default.join(TRACE_STORAGE_PATH, `${traceId}.json`);
    const traceData = await promises_1.default.readFile(tracePath, 'utf-8');
    return JSON.parse(traceData);
}
initializeServices();
// Auth middleware (simplified)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    req.user = { id: 'user-123', address: '0x...' };
    next();
};
// Language to worker type mapping
const LANGUAGE_WORKER_MAP = {
    solidity: types_1.WorkerType.COMPILER_FOUNDRY, // Default to Foundry, could be configurable
    rust: types_1.WorkerType.GRADER_RUST,
    javascript: types_1.WorkerType.GRADER_RUST, // Use Rust grader for JS
    python: types_1.WorkerType.GRADER_RUST, // Use Rust grader for Python
    move: types_1.WorkerType.COMPILER_MOVE
};
// Tool-specific mappings for advanced users
const TOOL_WORKER_MAP = {
    foundry: types_1.WorkerType.COMPILER_FOUNDRY,
    anvil: types_1.WorkerType.COMPILER_FOUNDRY,
    hardhat: types_1.WorkerType.COMPILER_HARDHAT,
    cargo: types_1.WorkerType.COMPILER_CARGO,
    'move-cli': types_1.WorkerType.COMPILER_MOVE
};
// Submit code for grading
app.post('/submit', authenticateToken, async (req, res) => {
    try {
        const { challengeId, code, language, testCases, tool, metadata = {} } = req.body;
        const userId = req.user.id;
        // Set default metadata values
        const jobMetadata = {
            gasLimit: metadata.gasLimit || DEFAULT_GAS_LIMIT,
            timeLimit: metadata.timeLimit || DEFAULT_TIME_LIMIT,
            enableTracing: metadata.enableTracing !== false, // Default to true
            checkPlagiarism: metadata.checkPlagiarism !== false // Default to true
        };
        // Determine worker type
        let workerType;
        if (tool && TOOL_WORKER_MAP[tool]) {
            workerType = TOOL_WORKER_MAP[tool];
        }
        else if (LANGUAGE_WORKER_MAP[language]) {
            workerType = LANGUAGE_WORKER_MAP[language];
        }
        else {
            return res.status(400).json({ error: `Unsupported language/tool: ${language}${tool ? `/${tool}` : ''}` });
        }
        // Perform plagiarism check if enabled
        let plagiarismResult;
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
        const dbJob = await prisma.gradingJob.create({
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
        const job = {
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
    }
    catch (error) {
        console.error('Error submitting grading job:', error);
        res.status(500).json({ error: 'Failed to submit grading job' });
    }
});
// Get grading result
app.get('/submit/:jobId', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        // Fetch from Redis first
        let jobData = await redisClient.get(`job:${jobId}`);
        let job;
        if (jobData) {
            job = JSON.parse(jobData);
        }
        else {
            // Fallback to database
            const dbJob = await prisma.gradingJob.findUnique({
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
        }
        else {
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
    }
    catch (error) {
        console.error('Error fetching grading result:', error);
        res.status(500).json({ error: 'Failed to fetch grading result' });
    }
});
// Get execution trace for audit
app.get('/submit/:jobId/trace', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        const trace = await getExecutionTrace(jobId);
        res.json(trace);
    }
    catch (error) {
        console.error('Error fetching execution trace:', error);
        res.status(500).json({ error: 'Failed to fetch execution trace' });
    }
});
// Get grading queue status
app.get('/queue/status', async (req, res) => {
    try {
        // Get queue statistics
        const queueInfo = await rabbitmqChannel.checkQueue('grading_jobs');
        const activeJobs = await prisma.gradingJob.count({
            where: { status: { in: ['QUEUED', 'PROCESSING'] } }
        });
        const status = {
            queued: queueInfo.messageCount,
            processing: activeJobs,
            completed: await prisma.gradingJob.count({ where: { status: 'COMPLETED' } }),
            failed: await prisma.gradingJob.count({ where: { status: 'FAILED' } }),
            averageWaitTime: 45, // seconds - could be calculated from actual data
            totalJobs: await prisma.gradingJob.count()
        };
        res.json(status);
    }
    catch (error) {
        console.error('Error fetching queue status:', error);
        res.status(500).json({ error: 'Failed to fetch queue status' });
    }
});
// Admin endpoint to manage workers
app.get('/workers/status', authenticateToken, async (req, res) => {
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
    }
    catch (error) {
        console.error('Error fetching worker status:', error);
        res.status(500).json({ error: 'Failed to fetch worker status' });
    }
});
// Cache management endpoints
app.get('/cache/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await cache.getStats();
        res.json({
            ...stats,
            hitRate: 0, // Could be tracked separately
            lastCleanup: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error fetching cache stats:', error);
        res.status(500).json({ error: 'Failed to fetch cache stats' });
    }
});
app.post('/cache/cleanup', authenticateToken, async (req, res) => {
    try {
        await cache.cleanup();
        res.json({ message: 'Cache cleanup completed' });
    }
    catch (error) {
        console.error('Error during cache cleanup:', error);
        res.status(500).json({ error: 'Cache cleanup failed' });
    }
});
// Process grading job (internal function)
async function processGradingJob(jobId, payload, workerType) {
    let assignedWorkerId;
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
        await prisma.gradingJob.update({
            where: { jobId },
            data: {
                status: 'PROCESSING',
                startedAt: new Date()
            }
        });
        (0, exports.broadcastJobUpdate)(jobId, { status: 'processing', startedAt: new Date() });
        // Get worker from pool
        const worker = await workerPool.getOrCreateWorker(workerType);
        assignedWorkerId = worker.id;
        console.log(`Assigned worker ${worker.id} (${worker.endpoint}) for job ${jobId}`);
        // Check cache for compilation results if this is a compilation job
        let cachedResult = null;
        let cacheKey;
        if (payload.metadata?.enableCaching !== false && payload.code) {
            try {
                const compilerVersion = payload.metadata?.compilerVersion || 'latest';
                const optimizationLevel = payload.metadata?.optimizationLevel || 0;
                cacheKey = cache.generateCacheKey(payload.code, compilerVersion, optimizationLevel);
                console.log(`Checking cache for job ${jobId} with key: ${cacheKey}`);
                cachedResult = await cache.retrieve(cacheKey);
                if (cachedResult) {
                    console.log(`Cache hit for job ${jobId}, using cached compilation result`);
                }
                else {
                    console.log(`Cache miss for job ${jobId}, proceeding with compilation`);
                }
            }
            catch (cacheError) {
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
        const response = await axios_1.default.post(`${worker.endpoint}/grade`, enhancedPayload, {
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
            }
            catch (cacheError) {
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
        let traceId;
        if (enhancedPayload.enableTracing && rawResult.executionTrace) {
            try {
                traceId = await storeExecutionTrace(jobId, rawResult.executionTrace);
                console.log(`Stored execution trace for job ${jobId}: ${traceId}`);
            }
            catch (traceError) {
                console.error(`Failed to store execution trace for job ${jobId}:`, traceError);
                // Don't fail the job if trace storage fails
            }
        }
        // Store plagiarism check result if performed
        let plagiarismResult;
        if (payload.metadata?.checkPlagiarism) {
            plagiarismResult = await checkPlagiarism(payload.code, payload.language);
            // Store the code hash for future plagiarism checks
            const codeHash = crypto_1.default.createHash('sha256').update(payload.code).digest('hex');
            await redisClient.sAdd(`plagiarism:${payload.language}`, codeHash);
        }
        // Create comprehensive result
        const result = {
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
        await prisma.gradingJob.update({
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
        (0, exports.broadcastJobUpdate)(jobId, {
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
    }
    catch (error) {
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
        await prisma.gradingJob.update({
            where: { jobId },
            data: {
                status: 'FAILED',
                error: error instanceof Error ? error.message : 'Unknown error',
                completedAt: new Date(),
                assignedWorkerId
            }
        });
        (0, exports.broadcastJobUpdate)(jobId, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            completedAt: new Date()
        });
        // TODO: Retry logic or dead letter queue
    }
    finally {
        // Release worker back to pool
        if (assignedWorkerId) {
            try {
                await workerPool.releaseWorker(assignedWorkerId);
            }
            catch (releaseError) {
                console.error(`Error releasing worker ${assignedWorkerId}:`, releaseError);
            }
        }
    }
}
// Batch grading for tournaments/competitions
app.post('/grade/batch', authenticateToken, async (req, res) => {
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
        const results = await Promise.allSettled(submissions.map((submission) => {
            const workerType = LANGUAGE_WORKER_MAP[submission.language] || types_1.WorkerType.GRADER_RUST;
            return processGradingJob(`batch_${batchJobId}_${submission.id}`, {
                code: submission.code,
                language: submission.language,
                testCases: submission.testCases || [],
                challengeId: submission.challengeId,
                userId: submission.userId,
                metadata: { ...batchMetadata, ...submission.metadata } // Allow per-submission overrides
            }, workerType);
        }));
        const successful = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;
        res.json({
            batchJobId,
            total: submissions.length,
            successful,
            failed,
            status: 'processing',
            metadata: batchMetadata
        });
    }
    catch (error) {
        console.error('Error processing batch grading:', error);
        res.status(500).json({ error: 'Failed to process batch grading' });
    }
});
// Health check
app.get('/health', (req, res) => {
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
        workerTypes: Object.values(types_1.WorkerType),
        workerStats: workerPool.getWorkerStats()
    });
});
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    try {
        if (rabbitmqChannel)
            await rabbitmqChannel.close();
        if (rabbitmqConnection)
            await rabbitmqConnection.close();
        await redisClient.disconnect();
        await prisma.$disconnect();
        await workerPool.shutdown();
    }
    catch (error) {
        console.error('Error during shutdown:', error);
    }
    process.exit(0);
});
app.listen(PORT, () => {
    console.log(`Grader Orchestration Service running on port ${PORT}`);
});
// WebSocket server for real-time job updates
const wss = new ws_1.default.Server({ port: 4007 }); // Use a different port for WS
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'subscribe' && data.jobId) {
                // Subscribe to job updates
                ws.send(JSON.stringify({ type: 'subscribed', jobId: data.jobId }));
            }
        }
        catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
        }
    });
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});
// Function to broadcast job updates
const broadcastJobUpdate = (jobId, update) => {
    wss.clients.forEach(client => {
        if (client.readyState === ws_1.default.OPEN) {
            client.send(JSON.stringify({ type: 'job_update', jobId, ...update }));
        }
    });
};
exports.broadcastJobUpdate = broadcastJobUpdate;
//# sourceMappingURL=index.js.map