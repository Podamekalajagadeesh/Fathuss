import Docker from 'dockerode';
import { Worker, WorkerType, WorkerStatus, WorkerPoolConfig } from './types';

export class WorkerPoolManager {
  private docker: Docker;
  private workers: Map<string, Worker> = new Map();
  private config: WorkerPoolConfig;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config: WorkerPoolConfig) {
    this.docker = new Docker();
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Start health check routine
    this.startHealthChecks();

    // Clean up any existing workers
    await this.cleanup();
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    for (const [workerId, worker] of this.workers) {
      if (worker.status === WorkerStatus.READY || worker.status === WorkerStatus.BUSY) {
        try {
          await this.checkWorkerHealth(worker);
        } catch (error) {
          console.error(`Worker ${workerId} health check failed:`, error);
          worker.status = WorkerStatus.ERROR;
          await this.destroyWorker(workerId);
        }
      }
    }
  }

  private async checkWorkerHealth(worker: Worker): Promise<void> {
    if (!worker.endpoint) return;

    // Simple health check with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${worker.endpoint}/health`, {
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getOrCreateWorker(workerType: WorkerType): Promise<Worker> {
    // Find available worker
    let worker = this.findAvailableWorker(workerType);

    if (!worker) {
      // Create new worker if under limit
      if (this.workers.size < this.config.maxWorkers) {
        worker = await this.createWorker(workerType);
      } else {
        // Wait for worker to become available or throw error
        throw new Error('No available workers and at max capacity');
      }
    }

    worker.status = WorkerStatus.BUSY;
    worker.lastUsedAt = new Date();
    return worker;
  }

  private findAvailableWorker(workerType: WorkerType): Worker | undefined {
    for (const worker of this.workers.values()) {
      if (worker.type === workerType && worker.status === WorkerStatus.READY) {
        return worker;
      }
    }
    return undefined;
  }

  private async createWorker(workerType: WorkerType): Promise<Worker> {
    const workerId = `worker_${workerType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const worker: Worker = {
      id: workerId,
      type: workerType,
      status: WorkerStatus.STARTING,
      createdAt: new Date(),
      capabilities: this.getCapabilitiesForType(workerType)
    };

    this.workers.set(workerId, worker);

    try {
      if (this.config.firecrackerEnabled && workerType === WorkerType.GRADER_RUST) {
        // Use Firecracker for Rust graders
        await this.createFirecrackerWorker(worker);
      } else {
        // Use Docker for all workers
        await this.createDockerWorker(worker);
      }

      worker.status = WorkerStatus.READY;
      console.log(`Created worker ${workerId} of type ${workerType}`);
    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
      worker.status = WorkerStatus.ERROR;
      throw error;
    }

    return worker;
  }

  private async createDockerWorker(worker: Worker): Promise<void> {
    const containerConfig = this.getDockerConfig(worker.type);

    const container = await this.docker.createContainer(containerConfig);
    await container.start();

    // Get container info for networking
    const containerInfo = await container.inspect();
    const port = containerInfo.NetworkSettings.Ports['8080/tcp'][0].HostPort;

    worker.containerId = container.id;
    worker.endpoint = `http://localhost:${port}`;
  }

  private async createFirecrackerWorker(worker: Worker): Promise<void> {
    // Firecracker implementation would go here
    // Firecracker setup is complex and requires additional dependencies
    // For now, throw an error indicating it's not implemented
    throw new Error('Firecracker implementation not yet complete');
  }

  private getDockerConfig(workerType: WorkerType): any {
    const baseConfig = {
      Image: this.config.dockerImage,
      ExposedPorts: { '8080/tcp': {} },
      HostConfig: {
        PortBindings: { '8080/tcp': [{ HostPort: '' }] }, // Auto-assign port
        Memory: 512 * 1024 * 1024, // 512MB
        CpuQuota: 50000, // 0.5 CPU cores
        CpuPeriod: 100000
      },
      Env: [
        `WORKER_TYPE=${workerType}`,
        `TIMEOUT=${this.config.workerTimeout}`
      ]
    };

    // Add type-specific configuration
    switch (workerType) {
      case WorkerType.COMPILER_FOUNDRY:
        return {
          ...baseConfig,
          Env: [...baseConfig.Env, 'FOUNDRY=true']
        };
      case WorkerType.COMPILER_HARDHAT:
        return {
          ...baseConfig,
          Env: [...baseConfig.Env, 'HARDHAT=true']
        };
      case WorkerType.COMPILER_CARGO:
        return {
          ...baseConfig,
          Env: [...baseConfig.Env, 'CARGO=true']
        };
      case WorkerType.COMPILER_MOVE:
        return {
          ...baseConfig,
          Env: [...baseConfig.Env, 'MOVE_CLI=true']
        };
      default:
        return baseConfig;
    }
  }

  private getCapabilitiesForType(workerType: WorkerType): string[] {
    switch (workerType) {
      case WorkerType.GRADER_RUST:
        return ['rust', 'cargo'];
      case WorkerType.COMPILER_FOUNDRY:
        return ['solidity', 'foundry', 'anvil'];
      case WorkerType.COMPILER_HARDHAT:
        return ['solidity', 'hardhat'];
      case WorkerType.COMPILER_CARGO:
        return ['rust', 'cargo'];
      case WorkerType.COMPILER_MOVE:
        return ['move', 'move-cli'];
      default:
        return [];
    }
  }

  async releaseWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = WorkerStatus.READY;
      worker.lastUsedAt = new Date();
    }
  }

  async destroyWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    worker.status = WorkerStatus.STOPPING;

    try {
      if (worker.containerId) {
        const container = this.docker.getContainer(worker.containerId);
        await container.stop({ t: 10 });
        await container.remove();
      }

      // Firecracker cleanup would go here

      this.workers.delete(workerId);
      console.log(`Destroyed worker ${workerId}`);
    } catch (error) {
      console.error(`Error destroying worker ${workerId}:`, error);
      worker.status = WorkerStatus.ERROR;
    }
  }

  async cleanup(): Promise<void> {
    const workerIds = Array.from(this.workers.keys());
    await Promise.all(workerIds.map(id => this.destroyWorker(id)));
  }

  getWorkerStats(): any {
    const stats = {
      total: this.workers.size,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>
    };

    for (const worker of this.workers.values()) {
      stats.byType[worker.type] = (stats.byType[worker.type] || 0) + 1;
      stats.byStatus[worker.status] = (stats.byStatus[worker.status] || 0) + 1;
    }

    return stats;
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    await this.cleanup();
  }
}