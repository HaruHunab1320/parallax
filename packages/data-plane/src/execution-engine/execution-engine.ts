import {
  ExecutionTask,
  ExecutionResult,
  ParallelExecutionPlan,
  ExecutionMetrics,
  CachePolicy,
  PatternExecutor,
} from './types';
import { ParallelExecutor } from './parallel-executor';
import { ResultCache } from './result-cache';
import { AgentProxy } from '../agent-proxy';
import { ConfidenceTracker } from '../confidence-tracker';
import { Logger } from 'pino';
import { EventEmitter } from 'events';

export interface ExecutionEngineConfig {
  maxConcurrency: number;
  defaultTimeout: number;
  retryConfig: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
  cache: CachePolicy;
  patternExecutor?: PatternExecutor;
}

export class ExecutionEngine extends EventEmitter {
  private parallelExecutor: ParallelExecutor;
  private cache: ResultCache;
  private patternExecutor?: PatternExecutor;
  private metrics: ExecutionMetrics = {
    totalTasks: 0,
    successfulTasks: 0,
    failedTasks: 0,
    averageExecutionTime: 0,
    averageConfidence: 0,
    parallelExecutions: 0,
  };

  constructor(
    private config: ExecutionEngineConfig,
    private agentProxy: AgentProxy,
    private confidenceTracker: ConfidenceTracker,
    private logger: Logger
  ) {
    super();
    this.parallelExecutor = new ParallelExecutor();
    this.cache = new ResultCache(config.cache);
    this.patternExecutor = config.patternExecutor;

    this.setupEventHandlers();
  }

  /**
   * Set the pattern executor for nested pattern execution.
   * Allows deferred injection to avoid circular dependencies.
   */
  setPatternExecutor(executor: PatternExecutor): void {
    this.patternExecutor = executor;
  }

  private setupEventHandlers(): void {
    this.parallelExecutor.on('parallel:completed', (data) => {
      this.metrics.parallelExecutions++;
      this.logger.info(data, 'Parallel execution completed');
    });

    this.parallelExecutor.on('parallel:early-termination', (data) => {
      this.logger.info(data, 'Parallel execution terminated early');
    });
  }

  async executeTask(task: ExecutionTask): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.cache.generateKey(task.type, task.target, task.payload);
    const cachedResult = this.cache.get(cacheKey);
    
    if (cachedResult) {
      this.logger.debug({ taskId: task.id }, 'Cache hit');
      this.emit('task:cache-hit', { taskId: task.id });
      return cachedResult;
    }

    try {
      const result = await this.executeWithRetry(task);
      
      // Update metrics
      this.updateMetrics(result, Date.now() - startTime);
      
      // Cache successful results
      if (result.status === 'success') {
        this.cache.set(cacheKey, result);
      }
      
      // Track confidence
      if (result.confidence !== undefined && task.type === 'agent') {
        await this.confidenceTracker.recordConfidence({
          agentId: task.target,
          pattern: task.metadata && 'pattern' in task.metadata ? String(task.metadata.pattern) : 'unknown',
          task: task.type,
          confidence: result.confidence,
          timestamp: new Date(),
          executionId: task.id,
          metadata: {
            taskType: task.type,
            executionTime: result.executionTime,
          },
        });
      }
      
      this.emit('task:completed', result);
      return result;
    } catch (error) {
      const errorResult: ExecutionResult = {
        taskId: task.id,
        status: 'failure',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
        retries: 0,
      };
      
      this.updateMetrics(errorResult, Date.now() - startTime);
      this.emit('task:failed', errorResult);
      
      return errorResult;
    }
  }

  private async executeWithRetry(task: ExecutionTask): Promise<ExecutionResult> {
    const maxRetries = task.metadata?.retries ?? this.config.retryConfig.maxRetries;
    let lastError: Error | null = null;
    let retries = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.config.retryConfig.initialDelay * 
            Math.pow(this.config.retryConfig.backoffMultiplier, attempt - 1);
          
          this.logger.debug(
            { taskId: task.id, attempt, delay },
            'Retrying task after delay'
          );
          
          await this.delay(delay);
        }

        const result = await this.executeSingleTask(task);
        result.retries = retries;
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retries++;
        
        this.logger.warn(
          { taskId: task.id, attempt, error: lastError.message },
          'Task execution failed, will retry'
        );
      }
    }

    throw lastError || new Error('Task execution failed');
  }

  private async executeSingleTask(task: ExecutionTask): Promise<ExecutionResult> {
    const startTime = Date.now();

    switch (task.type) {
      case 'agent': {
        const response = await this.agentProxy.request({
          agentId: task.target,
          method: 'analyze',
          payload: task.payload,
          timeout: task.metadata?.timeout ?? this.config.defaultTimeout,
        });

        return {
          taskId: task.id,
          status: 'success',
          result: response.data,
          confidence: response.data && typeof response.data === 'object' && 'confidence' in response.data ? (response.data as any).confidence : undefined,
          executionTime: Date.now() - startTime,
          retries: 0,
          metadata: response.metadata,
        };
      }

      case 'pattern': {
        if (!this.patternExecutor) {
          throw new Error('Pattern execution requested but no PatternExecutor configured');
        }

        const patternResult = await this.patternExecutor.execute(
          task.target,
          task.payload,
          {
            timeout: task.metadata?.timeout,
            parentTaskId: task.id,
          }
        );

        return {
          taskId: task.id,
          status: patternResult.status === 'completed' ? 'success' : 'failure',
          result: patternResult.result,
          error: patternResult.error,
          confidence: patternResult.confidence,
          executionTime: patternResult.executionTime,
          retries: 0,
          metadata: {
            patternName: patternResult.patternName,
            nestedExecutionId: patternResult.id,
          },
        };
      }

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  async executeParallel(plan: ParallelExecutionPlan): Promise<ExecutionResult[]> {
    this.logger.info(
      { planId: plan.id, taskCount: plan.tasks.length },
      'Starting parallel execution'
    );

    const taskExecutor = (task: ExecutionTask) => this.executeTask(task);
    
    return this.parallelExecutor.execute(plan, taskExecutor);
  }

  async executeDAG(tasks: ExecutionTask[]): Promise<Map<string, ExecutionResult>> {
    this.logger.info(
      { taskCount: tasks.length },
      'Starting DAG execution'
    );

    const taskExecutor = (task: ExecutionTask) => this.executeTask(task);
    
    return this.parallelExecutor.executeDAG(
      tasks, 
      taskExecutor, 
      this.config.maxConcurrency
    );
  }

  private updateMetrics(result: ExecutionResult, executionTime: number): void {
    this.metrics.totalTasks++;
    
    if (result.status === 'success') {
      this.metrics.successfulTasks++;
    } else {
      this.metrics.failedTasks++;
    }
    
    // Update average execution time
    const totalTime = this.metrics.averageExecutionTime * (this.metrics.totalTasks - 1);
    this.metrics.averageExecutionTime = (totalTime + executionTime) / this.metrics.totalTasks;
    
    // Update average confidence
    if (result.confidence !== undefined) {
      const totalConfidence = this.metrics.averageConfidence * (this.metrics.totalTasks - 1);
      this.metrics.averageConfidence = (totalConfidence + result.confidence) / this.metrics.totalTasks;
    }
  }

  getMetrics(): ExecutionMetrics {
    return { ...this.metrics };
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown(): Promise<void> {
    this.cache.clear();
    this.removeAllListeners();
    this.parallelExecutor.removeAllListeners();
  }

  /**
   * Get the AgentProxy instance for agent registration
   */
  getAgentProxy(): AgentProxy {
    return this.agentProxy;
  }
}