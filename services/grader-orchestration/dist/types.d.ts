export interface Worker {
    id: string;
    type: WorkerType;
    status: WorkerStatus;
    containerId?: string;
    vmId?: string;
    endpoint?: string;
    createdAt: Date;
    lastUsedAt?: Date;
    capabilities: string[];
}
export declare enum WorkerType {
    GRADER_RUST = "grader_rust",
    COMPILER_FOUNDRY = "compiler_foundry",
    COMPILER_HARDHAT = "compiler_hardhat",
    COMPILER_CARGO = "compiler_cargo",
    COMPILER_MOVE = "compiler_move"
}
export declare enum WorkerStatus {
    STARTING = "starting",
    READY = "ready",
    BUSY = "busy",
    STOPPING = "stopping",
    STOPPED = "stopped",
    ERROR = "error"
}
export interface GradingJob {
    jobId: string;
    payload: {
        code: string;
        language: string;
        testCases: any[];
        challengeId: string;
        userId: string;
        metadata?: {
            gasLimit?: number;
            timeLimit?: number;
            enableTracing?: boolean;
            checkPlagiarism?: boolean;
        };
    };
    workerType: WorkerType;
    assignedWorkerId?: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    submittedAt: Date;
    completedAt?: Date;
    result?: GradingResult;
    error?: string;
}
export interface GradingResult {
    jobId: string;
    status: 'completed' | 'failed';
    score: number;
    passedTests: number;
    totalTests: number;
    gasUsed?: number;
    timeUsed?: number;
    executionTrace?: ExecutionTrace;
    plagiarismCheck?: PlagiarismResult;
    output: string;
    error?: string;
    language: string;
}
export interface ExecutionTrace {
    events: TraceEvent[];
    gasProfile: GasProfile[];
    callStack: CallFrame[];
    storageAccess: StorageAccess[];
}
export interface TraceEvent {
    timestamp: number;
    eventType: string;
    data: any;
    gasUsed: number;
}
export interface GasProfile {
    operation: string;
    gasUsed: number;
    gasLimit: number;
}
export interface CallFrame {
    functionName: string;
    parameters: any[];
    returnValue?: any;
    gasUsed: number;
}
export interface StorageAccess {
    operation: 'read' | 'write';
    key: string;
    value?: string;
    gasUsed: number;
}
export interface PlagiarismResult {
    isPlagiarized: boolean;
    similarityScore: number;
    matchedSources: string[];
    confidence: number;
}
export interface WorkerPoolConfig {
    maxWorkers: number;
    workerTimeout: number;
    healthCheckInterval: number;
    dockerImage: string;
    firecrackerEnabled: boolean;
}
//# sourceMappingURL=types.d.ts.map