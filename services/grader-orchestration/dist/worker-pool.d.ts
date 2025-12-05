import { Worker, WorkerType, WorkerPoolConfig } from './types';
export declare class WorkerPoolManager {
    private docker;
    private workers;
    private config;
    private healthCheckTimer?;
    constructor(config: WorkerPoolConfig);
    initialize(): Promise<void>;
    private startHealthChecks;
    private performHealthChecks;
    private checkWorkerHealth;
    getOrCreateWorker(workerType: WorkerType): Promise<Worker>;
    private findAvailableWorker;
    private createWorker;
    private createDockerWorker;
    private createFirecrackerWorker;
    private getDockerConfig;
    private getCapabilitiesForType;
    releaseWorker(workerId: string): Promise<void>;
    destroyWorker(workerId: string): Promise<void>;
    cleanup(): Promise<void>;
    getWorkerStats(): any;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=worker-pool.d.ts.map