import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionEventBus } from '@/execution-events';
import { WorkflowExecutor } from '@/org-patterns/workflow-executor';
import { PatternEngine } from '@/pattern-engine/pattern-engine';

const logger = pino({ level: 'silent' });
const pattern = {
  name: 'test',
  version: '1',
  description: 'test',
  script: '',
  input: { type: 'any' },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function createEngine(overrides: Record<string, unknown> = {}) {
  const engine = new PatternEngine({
    agentRegistry: { listServices: vi.fn().mockResolvedValue([]) } as any,
    patternsDir: '/tmp/parallax-test',
    logger,
    ...overrides,
  });
  vi.spyOn(engine, 'getPattern').mockReturnValue(pattern);
  return engine;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('execution lifecycle', () => {
  it('passes the canonical execution ID and abort signal into org workflows', async () => {
    const started = deferred<void>();
    const cancelled = vi
      .spyOn(WorkflowExecutor.prototype, 'cancelExecution')
      .mockResolvedValue();
    const run = vi
      .spyOn(WorkflowExecutor.prototype, 'execute')
      .mockImplementation(async (_pattern, _input, options) => {
        started.resolve();
        return new Promise((_resolve, reject) =>
          options!.signal!.addEventListener('abort', () =>
            reject(options!.signal!.reason)
          )
        );
      });
    const engine = createEngine({ agentRuntimeService: {} });
    vi.mocked(engine.getPattern).mockReturnValue({
      ...pattern,
      threads: { enabled: true },
      metadata: {
        orgChart: true,
        orgPattern: { workflow: { steps: [] } },
      },
    });
    const result = engine
      .executePattern('test', {}, { executionId: 'canonical-id', timeout: 0 })
      .catch((error) => error);
    await started.promise;
    expect(run.mock.calls[0][2]).toMatchObject({
      executionId: 'canonical-id',
      signal: expect.any(AbortSignal),
    });
    expect(await engine.cancelExecution('canonical-id')).toBe(true);
    expect(await result).toBeInstanceOf(Error);
    expect(cancelled).toHaveBeenCalledWith('canonical-id');
    expect(engine.getExecution('canonical-id')?.status).toBe('cancelled');
  });

  it('prevents a late module result from completing or publishing a cancelled execution', async () => {
    const started = deferred<void>();
    const moduleResult = deferred<{ value: string; confidence: number }>();
    const workspace = {
      id: 'workspace',
      path: '/tmp/work',
      repo: 'org/repo',
      branch: { name: 'work', baseBranch: 'main' },
    };
    const finalize = vi.fn();
    const engine = createEngine({
      workspaceService: {
        provision: vi.fn().mockResolvedValue(workspace),
        finalize,
      },
    });
    vi.mocked(engine.getPattern).mockReturnValue({
      ...pattern,
      workspace: { enabled: true, repo: 'org/repo', createPr: true },
    });
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: () => {
        started.resolve();
        return moduleResult.promise;
      },
    });
    const result = engine
      .executePattern('test', {}, { executionId: 'cancel-me', timeout: 0 })
      .catch((error) => error);
    await started.promise;
    expect(await engine.cancelExecution('cancel-me')).toBe(true);
    expect(await result).toBeInstanceOf(Error);
    moduleResult.resolve({ value: 'late result', confidence: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.getExecution('cancel-me')?.status).toBe('cancelled');
    expect(finalize).not.toHaveBeenCalled();
  });

  it('times out underlying execution and clears timers without accepting late results', async () => {
    vi.useFakeTimers();
    const moduleResult = deferred<{ value: string; confidence: number }>();
    const started = deferred<void>();
    const engine = createEngine();
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: () => {
        started.resolve();
        return moduleResult.promise;
      },
    });
    const result = engine
      .executePattern('test', {}, { executionId: 'timeout', timeout: 100 })
      .catch((error) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(100);
    expect((await result).message).toContain('timed out');
    expect(engine.getExecution('timeout')?.status).toBe('failed');
    expect(vi.getTimerCount()).toBe(0);
    moduleResult.resolve({ value: 'too late', confidence: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.getExecution('timeout')?.status).toBe('failed');
  });

  it('reports reconciliation is required when publication outlives its timeout', async () => {
    vi.useFakeTimers();
    const started = deferred<void>();
    const publication = deferred<any>();
    const workspace = {
      id: 'workspace',
      path: '/tmp/work',
      repo: 'org/repo',
      branch: { name: 'work', baseBranch: 'main' },
    };
    const engine = createEngine({
      workspaceService: {
        provision: async () => workspace,
        finalize: () => {
          started.resolve();
          return publication.promise;
        },
      },
    });
    vi.mocked(engine.getPattern).mockReturnValue({
      ...pattern,
      workspace: { enabled: true, repo: 'org/repo', createPr: true },
    });
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: async () => ({ value: 'done', confidence: 1 }),
    });
    const result = engine
      .executePattern('test', {}, { executionId: 'publishing', timeout: 100 })
      .catch((error) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(100);
    expect((await result).message).toContain('requires reconciliation');
    expect(engine.getExecution('publishing')?.status).toBe('failed');
    publication.resolve(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.getExecution('publishing')?.status).toBe('failed');
  });

  it('waits for runtime stop before acknowledging cancellation', async () => {
    const stop = deferred<void>();
    const started = deferred<void>();
    const runtime = { stopThread: vi.fn(() => stop.promise) };
    const engine = createEngine({ agentRuntimeService: runtime });
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: () => {
        started.resolve();
        return new Promise(() => {});
      },
    });
    const result = engine
      .executePattern('test', {}, { executionId: 'owned', timeout: 0 })
      .catch((error) => error);
    await started.promise;
    (engine as any).spawnedThreads.set('owned', [{ id: 'thread-owned' }]);
    let acknowledged = false;
    const cancellation = engine.cancelExecution('owned').then((value) => {
      acknowledged = true;
      return value;
    });
    await vi.waitFor(() =>
      expect(runtime.stopThread).toHaveBeenCalledWith('thread-owned')
    );
    expect(acknowledged).toBe(false);
    stop.resolve();
    expect(await cancellation).toBe(true);
    await result;
  });

  it('reports incomplete cancellation when a runtime cannot stop', async () => {
    const started = deferred<void>();
    const events = new ExecutionEventBus();
    const outcomes: string[] = [];
    events.onExecution((event) => outcomes.push(event.type));
    const engine = createEngine({
      executionEvents: events,
      agentRuntimeService: {
        stopThread: vi.fn().mockRejectedValue(new Error('offline')),
      },
    });
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: () => {
        started.resolve();
        return new Promise(() => {});
      },
    });
    const result = engine
      .executePattern('test', {}, { executionId: 'offline', timeout: 0 })
      .catch((error) => error);
    await started.promise;
    (engine as any).spawnedThreads.set('offline', [{ id: 'offline-thread' }]);
    await expect(engine.cancelExecution('offline')).rejects.toThrow(
      'cleanup is incomplete'
    );
    await result;
    expect(engine.getExecution('offline')).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('reconciliation required'),
    });
    expect((engine as any).executionCleanupFailures.size).toBe(0);
    expect((engine as any).publicationStarted.size).toBe(0);
    expect(
      outcomes.filter((type) =>
        ['failed', 'completed', 'cancelled'].includes(type)
      )
    ).toEqual(['failed']);
  });

  it('reconciles a spawn that finishes after cancellation before acknowledging', async () => {
    const spawned = deferred<any>();
    const runtime = {
      spawnThread: vi.fn(() => spawned.promise),
      stopThread: vi.fn().mockResolvedValue(undefined),
    };
    const engine = createEngine({ agentRuntimeService: runtime });
    vi.mocked(engine.getPattern).mockReturnValue({
      ...pattern,
      minAgents: 1,
      threads: { enabled: true },
    });
    const result = engine
      .executePattern('test', {}, { executionId: 'spawning', timeout: 0 })
      .catch((error) => error);
    await vi.waitFor(() => expect(runtime.spawnThread).toHaveBeenCalled());
    let acknowledged = false;
    const cancellation = engine.cancelExecution('spawning').then((value) => {
      acknowledged = true;
      return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    spawned.resolve({ id: 'late-thread' });
    expect(await cancellation).toBe(true);
    expect(runtime.stopThread).toHaveBeenCalledWith('late-thread');
    await result;
  });

  it('bounds cancellation waiting when a runtime stop never responds', async () => {
    vi.useFakeTimers();
    const started = deferred<void>();
    const engine = createEngine({
      agentRuntimeService: { stopThread: () => new Promise(() => {}) },
    });
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: () => {
        started.resolve();
        return new Promise(() => {});
      },
    });
    const result = engine
      .executePattern('test', {}, { executionId: 'unreachable', timeout: 0 })
      .catch((error) => error);
    await started.promise;
    (engine as any).spawnedThreads.set('unreachable', [{ id: 'thread' }]);
    const cancellation = engine
      .cancelExecution('unreachable')
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(10000);
    expect((await cancellation).message).toContain('cleanup is incomplete');
    expect(vi.getTimerCount()).toBe(0);
    await result;
  });

  it('rejects duplicate execution IDs and leaves terminal results unchanged', async () => {
    vi.useFakeTimers();
    const engine = createEngine();
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: async () => ({ value: 'done', confidence: 1 }),
    });
    expect(
      (
        await engine.executePattern(
          'test',
          {},
          { executionId: 'once', timeout: 100 }
        )
      ).status
    ).toBe('completed');
    expect(vi.getTimerCount()).toBe(0);
    expect(await engine.cancelExecution('once')).toBe(false);
    await expect(
      engine.executePattern('test', {}, { executionId: 'once' })
    ).rejects.toThrow('already exists');
  });

  it.each(['module', 'workflow'])(
    'fails the %s execution when requested publication fails',
    async (kind) => {
      const finalize = vi
        .fn()
        .mockRejectedValue(new Error('provider unavailable after push'));
      const engine = createEngine({
        workspaceService: {
          provision: async () => ({
            id: 'ws',
            path: '/tmp/ws',
            repo: 'org/repo',
            branch: { name: 'work', baseBranch: 'main' },
          }),
          finalize,
        },
        agentRuntimeService: {},
      });
      vi.mocked(engine.getPattern).mockReturnValue({
        ...pattern,
        workspace: { enabled: true, repo: 'org/repo', createPr: true },
        ...(kind === 'workflow'
          ? {
              metadata: {
                orgChart: true,
                orgPattern: { workflow: { steps: [] } },
              },
            }
          : {}),
      });
      vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
        execute: async () => ({ value: 'done', confidence: 1 }),
      });
      vi.spyOn(WorkflowExecutor.prototype, 'execute').mockResolvedValue({
        output: 'done',
        metrics: { agentsUsed: 0, stepsExecuted: 0, durationMs: 1 },
      } as any);
      await expect(
        engine.executePattern(
          'test',
          {},
          { executionId: `publication-${kind}`, timeout: 0 }
        )
      ).rejects.toThrow('reconcile any push or pull request');
      expect(finalize).toHaveBeenCalledOnce();
      expect(engine.getExecution(`publication-${kind}`)).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('provider unavailable'),
      });
      expect((engine as any).publicationStarted.size).toBe(0);
      expect((engine as any).executionCleanupFailures.size).toBe(0);
    }
  );

  it('emits completion only after workers acknowledge cleanup', async () => {
    const stop = deferred<void>();
    const started = deferred<void>();
    const moduleResult = deferred<any>();
    const events = new ExecutionEventBus();
    const completed = vi.fn();
    events.onExecution((event) => {
      if (event.type === 'completed') completed(event);
    });
    const runtime = { stopThread: vi.fn(() => stop.promise) };
    const engine = createEngine({
      agentRuntimeService: runtime,
      executionEvents: events,
    });
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: () => {
        started.resolve();
        return moduleResult.promise;
      },
    });
    const result = engine.executePattern(
      'test',
      {},
      { executionId: 'cleanup-ack', timeout: 0 }
    );
    await started.promise;
    (engine as any).spawnedThreads.set('cleanup-ack', [{ id: 'worker' }]);
    moduleResult.resolve({ value: 'done', confidence: 1 });
    await vi.waitFor(() => expect(runtime.stopThread).toHaveBeenCalled());
    expect(completed).not.toHaveBeenCalled();
    expect(engine.getExecution('cleanup-ack')?.status).toBe('running');
    stop.resolve();
    expect((await result).status).toBe('completed');
    expect(completed).toHaveBeenCalledOnce();
  });
});
