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

export enum WorkerType {
  GRADER_RUST = 'grader_rust',
  COMPILER_FOUNDRY = 'compiler_foundry',
  COMPILER_HARDHAT = 'compiler_hardhat',
  COMPILER_CARGO = 'compiler_cargo',
  COMPILER_MOVE = 'compiler_move'
}

export enum WorkerStatus {
  STARTING = 'starting',
  READY = 'ready',
  BUSY = 'busy',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error'
}

export interface GradingJob {
  jobId: string;
  payload: {
    code: string;
    language: string;
    testCases: any[];
    challengeId: string;
    userId: string;
  };
  workerType: WorkerType;
  assignedWorkerId?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  submittedAt: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

export interface WorkerPoolConfig {
  maxWorkers: number;
  workerTimeout: number; // seconds
  healthCheckInterval: number; // milliseconds
  dockerImage: string;
  firecrackerEnabled: boolean;
}