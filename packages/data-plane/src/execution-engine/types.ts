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

/**
 * Interface for executing nested patterns.
 * Implemented by PatternEngine in control-plane.
 * Injected into ExecutionEngine to avoid circular dependency.
 */
export interface PatternExecutor {
  /**
   * Execute a pattern by name
   * @param patternName - Name of the pattern to execute
   * @param input - Input data for the pattern
   * @param options - Optional execution options
   * @returns Promise resolving to the execution result
   */
  execute(
    patternName: string,
    input: any,
    options?: PatternExecutorOptions
  ): Promise<PatternExecutionResult>;
}

export interface PatternExecutorOptions {
  timeout?: number;
  executionId?: string;
  parentTaskId?: string;
}

export interface PatternExecutionResult {
  id: string;
  patternName: string;
  status: 'completed' | 'failed';
  result?: any;
  error?: string;
  confidence?: number;
  executionTime: number;
}