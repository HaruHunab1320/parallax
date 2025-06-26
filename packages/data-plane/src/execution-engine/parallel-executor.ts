import { ExecutionTask, ExecutionResult, ParallelExecutionPlan } from './types';
import pLimit from 'p-limit';
import { EventEmitter } from 'events';

export class ParallelExecutor extends EventEmitter {
  async execute(
    plan: ParallelExecutionPlan,
    taskExecutor: (task: ExecutionTask) => Promise<ExecutionResult>
  ): Promise<ExecutionResult[]> {
    const limit = pLimit(plan.maxConcurrency || 10);
    
    switch (plan.strategy) {
      case 'all':
        return this.executeAll(plan.tasks, taskExecutor, limit, plan.timeout);
      
      case 'race':
        return this.executeRace(plan.tasks, taskExecutor, plan.timeout);
      
      case 'weighted':
        return this.executeWeighted(plan.tasks, taskExecutor, limit, plan.timeout);
      
      default:
        throw new Error(`Unknown execution strategy: ${plan.strategy}`);
    }
  }

  private async executeAll(
    tasks: ExecutionTask[],
    taskExecutor: (task: ExecutionTask) => Promise<ExecutionResult>,
    limit: any,
    timeout?: number
  ): Promise<ExecutionResult[]> {
    const startTime = Date.now();
    
    const taskPromises = tasks.map(task => 
      limit(() => this.executeWithTimeout(task, taskExecutor, timeout))
    );

    try {
      const results = await Promise.all(taskPromises);
      
      this.emit('parallel:completed', {
        strategy: 'all',
        taskCount: tasks.length,
        duration: Date.now() - startTime,
      });
      
      return results;
    } catch (error) {
      this.emit('parallel:failed', { error });
      throw error;
    }
  }

  private async executeRace(
    tasks: ExecutionTask[],
    taskExecutor: (task: ExecutionTask) => Promise<ExecutionResult>,
    timeout?: number
  ): Promise<ExecutionResult[]> {
    const startTime = Date.now();
    
    const taskPromises = tasks.map(task => 
      this.executeWithTimeout(task, taskExecutor, timeout)
    );

    try {
      const firstResult = await Promise.race(taskPromises);
      
      // Cancel other tasks (in a real implementation)
      this.emit('parallel:race-winner', {
        winnerId: firstResult.taskId,
        duration: Date.now() - startTime,
      });
      
      return [firstResult];
    } catch (error) {
      this.emit('parallel:failed', { error });
      throw error;
    }
  }

  private async executeWeighted(
    tasks: ExecutionTask[],
    taskExecutor: (task: ExecutionTask) => Promise<ExecutionResult>,
    limit: any,
    timeout?: number
  ): Promise<ExecutionResult[]> {
    const startTime = Date.now();
    
    // Sort tasks by priority
    const sortedTasks = [...tasks].sort((a, b) => 
      (b.metadata?.priority || 0) - (a.metadata?.priority || 0)
    );

    const results: ExecutionResult[] = [];
    const highConfidenceThreshold = 0.8;

    for (const task of sortedTasks) {
      try {
        const result = await limit(() => 
          this.executeWithTimeout(task, taskExecutor, timeout)
        );
        
        results.push(result);

        // If we get a high confidence result, we might stop early
        if (result.confidence && result.confidence >= highConfidenceThreshold) {
          this.emit('parallel:early-termination', {
            reason: 'high-confidence',
            confidence: result.confidence,
            completedTasks: results.length,
            totalTasks: tasks.length,
          });
          break;
        }
      } catch (error) {
        // Continue with other tasks on failure
        results.push({
          taskId: task.id,
          status: 'failure',
          error: error instanceof Error ? error.message : String(error),
          executionTime: Date.now() - startTime,
          retries: 0,
        });
      }
    }

    this.emit('parallel:completed', {
      strategy: 'weighted',
      taskCount: results.length,
      duration: Date.now() - startTime,
    });

    return results;
  }

  private async executeWithTimeout(
    task: ExecutionTask,
    taskExecutor: (task: ExecutionTask) => Promise<ExecutionResult>,
    timeout?: number
  ): Promise<ExecutionResult> {
    const timeoutMs = timeout || task.metadata?.timeout || 30000;
    
    const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), timeoutMs);
    });

    try {
      const result = await Promise.race([
        taskExecutor(task),
        timeoutPromise,
      ]);
      
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Task timeout') {
        return {
          taskId: task.id,
          status: 'timeout',
          executionTime: timeoutMs,
          retries: 0,
        };
      }
      throw error;
    }
  }

  async executeDAG(
    tasks: ExecutionTask[],
    taskExecutor: (task: ExecutionTask) => Promise<ExecutionResult>,
    maxConcurrency: number = 10
  ): Promise<Map<string, ExecutionResult>> {
    const results = new Map<string, ExecutionResult>();
    const inProgress = new Set<string>();
    const completed = new Set<string>();
    const limit = pLimit(maxConcurrency);

    const canExecute = (task: ExecutionTask): boolean => {
      if (!task.metadata?.dependencies) return true;
      
      return task.metadata.dependencies.every(dep => completed.has(dep));
    };

    const executeTask = async (task: ExecutionTask) => {
      inProgress.add(task.id);
      
      try {
        const result = await taskExecutor(task);
        results.set(task.id, result);
        completed.add(task.id);
      } catch (error) {
        results.set(task.id, {
          taskId: task.id,
          status: 'failure',
          error: error instanceof Error ? error.message : String(error),
          executionTime: 0,
          retries: 0,
        });
        completed.add(task.id);
      } finally {
        inProgress.delete(task.id);
      }
    };

    // Execute tasks respecting dependencies
    while (completed.size < tasks.length) {
      const readyTasks = tasks.filter(task => 
        !completed.has(task.id) && 
        !inProgress.has(task.id) && 
        canExecute(task)
      );

      if (readyTasks.length === 0 && inProgress.size === 0) {
        // Circular dependency or all remaining tasks have failed dependencies
        break;
      }

      await Promise.all(
        readyTasks.map(task => limit(() => executeTask(task)))
      );
    }

    return results;
  }
}