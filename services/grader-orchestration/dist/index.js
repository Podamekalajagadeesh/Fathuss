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
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4006;
// RabbitMQ connection
let rabbitmqConnection;
let rabbitmqChannel;
// Redis client for caching results
const redisClient = (0, redis_1.createClient)({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);
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
// Store execution trace for audit
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
app.post('/grade', authenticateToken, async (req, res) => {
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
app.get('/grade/:jobId', authenticateToken, async (req, res) => {
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
        }
        else {
            res.json({
                jobId: job.jobId,
                status: job.status,
                submittedAt: job.submittedAt
            });
        }
    }
    catch (error) {
        console.error('Error fetching grading result:', error);
        res.status(500).json({ error: 'Failed to fetch grading result' });
    }
});
// Get execution trace for audit
app.get('/grade/:jobId/trace', authenticateToken, async (req, res) => {
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
        // TODO: Get actual queue status
        const status = {
            queued: 5,
            processing: 2,
            completed: 150,
            failed: 3,
            averageWaitTime: 45 // seconds
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
        // Get worker from pool
        const worker = await workerPool.getOrCreateWorker(workerType);
        assignedWorkerId = worker.id;
        console.log(`Assigned worker ${worker.id} (${worker.endpoint}) for job ${jobId}`);
        // Prepare payload with gas/time limits
        const enhancedPayload = {
            ...payload,
            gasLimit: payload.metadata?.gasLimit || DEFAULT_GAS_LIMIT,
            timeLimit: payload.metadata?.timeLimit || DEFAULT_TIME_LIMIT,
            enableTracing: payload.metadata?.enableTracing ?? true
        };
        // Send to worker with timeout based on time limit
        const timeout = Math.min(enhancedPayload.timeLimit * 1000, workerPoolConfig.workerTimeout * 1000);
        const response = await axios_1.default.post(`${worker.endpoint}/grade`, enhancedPayload, {
            timeout
        });
        const rawResult = response.data;
        const processingTime = Date.now() - startTime;
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
        console.log(`Grading job ${jobId} completed with score: ${result.score}, gas: ${result.gasUsed}, time: ${processingTime}ms`);
        // TODO: Update leaderboard
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
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
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
//# sourceMappingURL=index.js.map