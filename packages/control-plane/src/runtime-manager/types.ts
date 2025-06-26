export interface RuntimeConfig {
  maxInstances: number;
  instanceTimeout: number;
  warmupInstances: number;
  metricsEnabled: boolean;
}

export interface RuntimeInstance {
  id: string;
  status: 'idle' | 'busy' | 'error';
  createdAt: Date;
  lastUsedAt?: Date;
  executionCount: number;
}

export interface RuntimeMetrics {
  activeInstances: number;
  idleInstances: number;
  totalExecutions: number;
  averageExecutionTime: number;
  errorRate: number;
}