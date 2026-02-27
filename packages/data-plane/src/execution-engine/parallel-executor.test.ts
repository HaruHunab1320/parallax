import { describe, it, expect, vi } from 'vitest';
import { ParallelExecutor } from './parallel-executor';
import { ExecutionTask, ExecutionResult, ParallelExecutionPlan } from './types';

function makeTask(id: string, overrides: Partial<ExecutionTask> = {}): ExecutionTask {
  return {
    id,
    type: 'agent',
    target: `agent-${id}`,
    payload: { task: 'analyze' },
    ...overrides,
  };
}

function makeResult(taskId: string, overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    taskId,
    status: 'success',
    result: { data: taskId },
    confidence: 0.9,
    executionTime: 50,
    retries: 0,
    ...overrides,
  };
}

describe('ParallelExecutor', () => {
  describe('execute with "all" strategy', () => {
    it('should execute all tasks and return results', async () => {
      const executor = new ParallelExecutor();
      const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3')];
      const plan: ParallelExecutionPlan = {
        id: 'plan-1',
        tasks,
        strategy: 'all',
        maxConcurrency: 5,
      };
      const taskExecutor = vi.fn((task: ExecutionTask) =>
        Promise.resolve(makeResult(task.id))
      );

      const results = await executor.execute(plan, taskExecutor);
      expect(results).toHaveLength(3);
      expect(taskExecutor).toHaveBeenCalledTimes(3);
    });

    it('should emit parallel:completed event', async () => {
      const executor = new ParallelExecutor();
      const completedHandler = vi.fn();
      executor.on('parallel:completed', completedHandler);

      const plan: ParallelExecutionPlan = {
        id: 'plan-1',
        tasks: [makeTask('t1')],
        strategy: 'all',
      };
      await executor.execute(plan, (task) => Promise.resolve(makeResult(task.id)));
      expect(completedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'all', taskCount: 1 })
      );
    });

    it('should respect concurrency limits', async () => {
      const executor = new ParallelExecutor();
      let concurrent = 0;
      let maxConcurrent = 0;

      const taskExecutor = async (task: ExecutionTask) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return makeResult(task.id);
      };

      const tasks = Array.from({ length: 10 }, (_, i) => makeTask(`t${i}`));
      const plan: ParallelExecutionPlan = {
        id: 'plan-1',
        tasks,
        strategy: 'all',
        maxConcurrency: 3,
      };

      await executor.execute(plan, taskExecutor);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  describe('execute with "race" strategy', () => {
    it('should return the first completed result', async () => {
      const executor = new ParallelExecutor();
      const tasks = [makeTask('fast'), makeTask('slow')];
      const plan: ParallelExecutionPlan = {
        id: 'plan-1',
        tasks,
        strategy: 'race',
        timeout: 5000,
      };

      const taskExecutor = async (task: ExecutionTask) => {
        const delay = task.id === 'fast' ? 10 : 100;
        await new Promise((r) => setTimeout(r, delay));
        return makeResult(task.id);
      };

      const results = await executor.execute(plan, taskExecutor);
      expect(results).toHaveLength(1);
      expect(results[0].taskId).toBe('fast');
    });
  });

  describe('execute with "weighted" strategy', () => {
    it('should execute tasks in priority order', async () => {
      const executor = new ParallelExecutor();
      const executionOrder: string[] = [];

      const tasks = [
        makeTask('low', { metadata: { priority: 1 } }),
        makeTask('high', { metadata: { priority: 10 } }),
        makeTask('mid', { metadata: { priority: 5 } }),
      ];
      const plan: ParallelExecutionPlan = {
        id: 'plan-1',
        tasks,
        strategy: 'weighted',
        maxConcurrency: 1, // Sequential to verify order
      };

      const taskExecutor = async (task: ExecutionTask) => {
        executionOrder.push(task.id);
        return makeResult(task.id, { confidence: 0.5 }); // Below threshold to not stop early
      };

      await executor.execute(plan, taskExecutor);
      expect(executionOrder).toEqual(['high', 'mid', 'low']);
    });

    it('should stop early on high confidence result', async () => {
      const executor = new ParallelExecutor();
      const earlyTermHandler = vi.fn();
      executor.on('parallel:early-termination', earlyTermHandler);

      const tasks = [
        makeTask('t1', { metadata: { priority: 10 } }),
        makeTask('t2', { metadata: { priority: 5 } }),
      ];
      const plan: ParallelExecutionPlan = {
        id: 'plan-1',
        tasks,
        strategy: 'weighted',
        maxConcurrency: 1,
      };

      const taskExecutor = async (task: ExecutionTask) =>
        makeResult(task.id, { confidence: 0.95 }); // High confidence → early termination

      const results = await executor.execute(plan, taskExecutor);
      expect(results).toHaveLength(1); // Only first task
      expect(earlyTermHandler).toHaveBeenCalled();
    });
  });

  describe('execute with unknown strategy', () => {
    it('should throw', async () => {
      const executor = new ParallelExecutor();
      const plan = {
        id: 'plan-1',
        tasks: [makeTask('t1')],
        strategy: 'unknown' as any,
      };
      await expect(executor.execute(plan, vi.fn())).rejects.toThrow('Unknown execution strategy');
    });
  });

  describe('executeDAG', () => {
    it('should execute tasks respecting dependencies', async () => {
      const executor = new ParallelExecutor();
      const executionOrder: string[] = [];

      const tasks = [
        makeTask('t1', { metadata: { dependencies: [] } }),
        makeTask('t2', { metadata: { dependencies: ['t1'] } }),
        makeTask('t3', { metadata: { dependencies: ['t1'] } }),
        makeTask('t4', { metadata: { dependencies: ['t2', 't3'] } }),
      ];

      const taskExecutor = async (task: ExecutionTask) => {
        executionOrder.push(task.id);
        return makeResult(task.id);
      };

      const results = await executor.executeDAG(tasks, taskExecutor, 2);
      expect(results.size).toBe(4);
      // t1 must come before t2 and t3
      expect(executionOrder.indexOf('t1')).toBeLessThan(executionOrder.indexOf('t2'));
      expect(executionOrder.indexOf('t1')).toBeLessThan(executionOrder.indexOf('t3'));
      // t2 and t3 must come before t4
      expect(executionOrder.indexOf('t2')).toBeLessThan(executionOrder.indexOf('t4'));
      expect(executionOrder.indexOf('t3')).toBeLessThan(executionOrder.indexOf('t4'));
    });

    it('should handle tasks with no dependencies', async () => {
      const executor = new ParallelExecutor();
      const tasks = [makeTask('t1'), makeTask('t2')];
      const taskExecutor = vi.fn((task: ExecutionTask) =>
        Promise.resolve(makeResult(task.id))
      );

      const results = await executor.executeDAG(tasks, taskExecutor);
      expect(results.size).toBe(2);
    });
  });
});
