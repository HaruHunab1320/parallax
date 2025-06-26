export interface ExecutionTask {
  id: string;
  type: 'agent' | 'pattern' | 'parallel';
  target: string; // agent ID or pattern name
  payload: any;
  metadata?: {
    priority?: number;
    timeout?: number;
    retries?: number;
    dependencies?: string[];
  };
}

export interface ExecutionResult {
  taskId: string;
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  result?: any;
  error?: string;
  confidence?: number;
  executionTime: number;
  retries: number;
  metadata?: Record<string, any>;
}

export interface ParallelExecutionPlan {
  id: string;
  tasks: ExecutionTask[];
  strategy: 'all' | 'race' | 'weighted';
  maxConcurrency?: number;
  timeout?: number;
}

export interface ExecutionMetrics {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  averageConfidence: number;
  parallelExecutions: number;
}

export interface CachePolicy {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  confidenceThreshold: number; // Only cache high confidence results
  maxEntries: number;
}