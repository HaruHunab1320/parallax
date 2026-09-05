import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRuntimeService } from '../../agent-runtime';
import { PatternLoader } from '../../pattern-engine/pattern-loader';
import { compileOrgPattern } from '../org-chart-compiler';
import type { OrgPattern } from '../types';
import {
  WorkflowExecutor,
  type WorkflowExecutorOptions,
} from '../workflow-executor';

const logger = pino({ level: 'silent' });
const response = (content: string) => ({
  content,
  type: 'response',
  timestamp: new Date(),
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function pattern(verify?: unknown): OrgPattern {
  return {
    name: 'hardened',
    structure: {
      name: 'team',
      roles: {
        worker: {
          id: 'worker',
          name: 'Worker',
          agentType: 'claude',
          reportsTo: 'reviewer',
          verify: verify as never,
        },
        reviewer: { id: 'reviewer', name: 'Reviewer', agentType: 'claude' },
      },
    },
    workflow: {
      name: 'work',
      steps: [
        { type: 'assign', role: 'worker', task: 'Implement change' },
        { type: 'assign', role: 'worker', task: 'Publish change' },
      ],
    },
  };
}
function fixture(options: WorkflowExecutorOptions = {}) {
  const runtime = Object.assign(new EventEmitter(), {
    spawn: vi.fn(async (config: { role: string }) => ({ id: config.role })),
    stop: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
    send: vi.fn(async () => response('Done')),
  });
  const executor = new WorkflowExecutor(
    runtime as unknown as AgentRuntimeService,
    logger,
    options
  );
  return { runtime, executor };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('required evidence gates', () => {
  it.each([
    { type: 'typo' },
    { type: 'human' },
    { type: 'checklist' },
    { type: 'command' },
    { type: 'command', run: '' },
    { type: 'command', run: 'true', timeoutMs: -1 },
    { type: 'command', run: 'true', passConfidence: 2 },
    { type: 'command', run: 'true', scorePattern: '[' },
    { oracles: [] },
    { oracles: [{ type: 'history' }], combine: 'weighted' },
    { oracles: [{ type: 'history' }], combine: 'product' },
    { type: 'agent', role: 'missing' },
    { type: 'agent', role: 'reviewer', optional: true },
  ])(
    'rejects unsupported or invalid policy before dispatch: %j',
    async (verify) => {
      const input = pattern(verify);
      const { runtime, executor } = fixture();
      expect(() => compileOrgPattern(input)).toThrow();
      await expect(executor.execute(input, {})).rejects.toThrow();
      expect(runtime.spawn).not.toHaveBeenCalled();
    }
  );

  it('does not register a YAML file with unknown verification', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'parallax-invalid-policy-'));
    try {
      await writeFile(
        path.join(dir, 'bad.yaml'),
        JSON.stringify(pattern({ type: 'typo' }))
      );
      const loader = new PatternLoader(dir, logger);
      await expect(loader.loadPatterns()).rejects.toThrow(
        'Unsupported verification oracle'
      );
      expect(loader.getPattern('hardened')).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([
    'Seems fine',
    'CONFIDENCE: 1.0',
    'VERDICT: approve | revise | reject',
    'VERDICT: approved',
    'VERDICT: reject\nCONFIDENCE: 1',
  ])('blocks publication for reviewer output %j', async (verdict) => {
    const { runtime, executor } = fixture();
    runtime.send.mockResolvedValue(response(verdict));
    await expect(
      executor.execute(pattern({ type: 'agent' }), {})
    ).rejects.toThrow('Required verification failed');
    expect(
      runtime.send.mock.calls.some((call) =>
        String(call[1]).includes('Publish change')
      )
    ).toBe(false);
    expect(runtime.stop).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when a required reviewer turn fails and never accepts', async () => {
    const { runtime, executor } = fixture();
    runtime.send.mockImplementation(async (id: string) => {
      if (id === 'reviewer') throw new Error('reviewer disconnected');
      return response('Done');
    });
    const events: any[] = [];
    executor.on('step_confidence', (event) => events.push(event));
    await expect(
      executor.execute(pattern({ type: 'agent' }), {})
    ).rejects.toThrow();
    expect(events[0].oracles).toEqual([
      expect.objectContaining({
        status: 'unavailable',
        required: true,
        confidence: 0,
      }),
    ]);
    expect(events.some((event) => event.action === 'accept')).toBe(false);
  });

  it('fails a nonzero command even when configured failure confidence is 1', async () => {
    const verifier = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: '10 passed, 0 failed',
      stderr: 'runner crashed',
    });
    const { runtime, executor } = fixture({ commandVerifier: verifier });
    await expect(
      executor.execute(
        pattern({
          type: 'command',
          run: 'policy-check',
          failConfidence: 1,
          scorePattern: '(\\d+) passed, (\\d+) failed',
        }),
        {}
      )
    ).rejects.toThrow('Required verification failed');
    expect(verifier).toHaveBeenCalledTimes(2);
    expect(
      runtime.send.mock.calls.some((call) => call[1] === 'Publish change')
    ).toBe(false);
  });

  it('accepts a supervisor correction only after the original command passes again', async () => {
    const verifier = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'missing requirement',
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });
    const { runtime, executor } = fixture({ commandVerifier: verifier });
    const input = pattern({
      type: 'command',
      run: 'immutable-policy',
      cwd: '${input.workspace}',
    });
    input.workflow.steps.pop();
    const result = await executor.execute(
      input,
      { workspace: '/worker/workspace' },
      { executionId: 'canonical-run' }
    );
    expect(result.executionId).toBe('canonical-run');
    expect(verifier).toHaveBeenCalledTimes(2);
    expect(
      verifier.mock.calls.map(([request]) => [
        request.executionId,
        request.role,
        request.command,
        request.cwd,
      ])
    ).toEqual(
      Array(2).fill([
        'canonical-run',
        'worker',
        'immutable-policy',
        '/worker/workspace',
      ])
    );
    expect(runtime.send).toHaveBeenCalledTimes(2);
    expect(runtime.stop).toHaveBeenCalledTimes(2);
  });

  it.each(['review', 'approve'] as const)(
    'gates standalone %s rejection before the next step',
    async (type) => {
      const { runtime, executor } = fixture();
      runtime.send.mockResolvedValue(response('VERDICT: reject'));
      const input = pattern();
      input.workflow.steps.unshift(
        type === 'review'
          ? { type, reviewer: 'reviewer', subject: 'candidate' }
          : { type, approver: 'reviewer', subject: 'candidate' }
      );
      await expect(executor.execute(input, {})).rejects.toThrow(
        'did not approve'
      );
      expect(runtime.send).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps an unavailable historical prior advisory', async () => {
    const { executor } = fixture();
    await expect(
      executor.execute(pattern({ type: 'history' }), {})
    ).resolves.toMatchObject({ patternName: 'hardened' });
  });
});

describe('isolated command contract', () => {
  it.each([false, true])(
    'never executes local commands in production, even with dev opt-in %s',
    async (allowLocalCommandVerification) => {
      vi.stubEnv('NODE_ENV', 'production');
      const { executor } = fixture({ allowLocalCommandVerification });
      const input = pattern({ type: 'command', run: 'exit 0' });
      await expect(executor.execute(input, {})).rejects.toThrow(
        'requires an isolated commandVerifier'
      );
    }
  );

  it('requires explicit opt-in outside production too', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    await expect(
      fixture().executor.execute(
        pattern({ type: 'command', run: 'exit 0' }),
        {}
      )
    ).rejects.toThrow('requires an isolated commandVerifier');
  });

  it('does not replace an unresolved configured workspace with control-plane cwd', async () => {
    const commandVerifier = vi.fn();
    const { executor } = fixture({ commandVerifier });
    await expect(
      executor.execute(
        pattern({ type: 'command', run: 'test', cwd: '${input.missing}' }),
        {}
      )
    ).rejects.toThrow('working directory did not resolve');
    expect(commandVerifier).not.toHaveBeenCalled();
  });

  it('bounds an unresponsive worker verifier and signals its cancellation', async () => {
    const signals: AbortSignal[] = [];
    const commandVerifier = vi.fn((request) => {
      signals.push(request.signal);
      return new Promise<never>(() => {});
    });
    const { executor } = fixture({ commandVerifier });
    await expect(
      executor.execute(
        pattern({ type: 'command', run: 'test', timeoutMs: 10 }),
        {}
      )
    ).rejects.toThrow('timed out');
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('stops a trusted local shell and its children when cancelled', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const dir = await mkdtemp(path.join(tmpdir(), 'parallax-command-cancel-'));
    try {
      const { executor } = fixture({ allowLocalCommandVerification: true });
      const controller = new AbortController();
      const input = pattern({
        type: 'command',
        cwd: dir,
        run: 'touch started; sleep 0.2; touch leaked',
      });
      const pending = executor.execute(
        input,
        {},
        { signal: controller.signal }
      );
      const rejected = expect(pending).rejects.toThrow('cancelled');
      await vi.waitFor(() => readFile(path.join(dir, 'started')), {
        interval: 5,
      });
      controller.abort(new Error('cancelled'));
      await rejected;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await expect(readFile(path.join(dir, 'leaked'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not inherit coordinator secrets in trusted local development', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PARALLAX_TEST_COORDINATOR_SECRET', 'test-only-value');
    const { executor } = fixture({ allowLocalCommandVerification: true });
    const input = pattern({
      type: 'command',
      run: 'test -z "$PARALLAX_TEST_COORDINATOR_SECRET"',
    });
    input.workflow.steps.pop();
    await expect(executor.execute(input, {})).resolves.toMatchObject({
      patternName: 'hardened',
    });
  });
});

describe('workflow cancellation and concurrency', () => {
  it('does not spawn when already aborted', async () => {
    const { runtime, executor } = fixture();
    await expect(
      executor.execute(
        pattern(),
        {},
        { signal: AbortSignal.abort(new Error('cancelled')) }
      )
    ).rejects.toThrow('cancelled');
    expect(runtime.spawn).not.toHaveBeenCalled();
  });

  it('aborts a running send, clears queued leaves and suppresses later steps', async () => {
    const { runtime, executor } = fixture({ maxParallel: 1 });
    runtime.send.mockImplementation(() => new Promise<never>(() => {}));
    const input = pattern();
    input.workflow.steps.unshift({
      type: 'parallel',
      steps: [
        { type: 'assign', role: 'worker', task: 'first' },
        { type: 'assign', role: 'reviewer', task: 'queued' },
      ],
    });
    const controller = new AbortController();
    const execution = executor.execute(
      input,
      {},
      { executionId: 'cancel-me', signal: controller.signal }
    );
    const rejected = expect(execution).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(runtime.send).toHaveBeenCalledTimes(1));
    controller.abort(new Error('cancelled'));
    await executor.cancelExecution('cancel-me');
    await rejected;
    await tick();
    expect(runtime.send).toHaveBeenCalledTimes(1);
    expect(runtime.stop).toHaveBeenCalledTimes(2);
  });

  it('reconciles a spawn returning after cancellation before acknowledging cleanup', async () => {
    const spawned = deferred<{ id: string }>();
    const { runtime, executor } = fixture();
    runtime.spawn.mockReturnValue(spawned.promise);
    const execution = executor.execute(
      pattern(),
      {},
      { executionId: 'late-spawn' }
    );
    const rejected = expect(execution).rejects.toThrow('cancelled');
    await tick();
    const stopped = executor.cancelExecution('late-spawn');
    spawned.resolve({ id: 'late-worker' });
    await stopped;
    await rejected;
    expect(runtime.stop).toHaveBeenCalledWith('late-worker');
    expect(runtime.send).not.toHaveBeenCalled();
  });

  it('stops a spawn when cancellation races the await continuation', async () => {
    const { runtime, executor } = fixture();
    const controller = new AbortController();
    const pending = executor.execute(
      pattern(),
      {},
      { signal: controller.signal }
    );
    const rejected = expect(pending).rejects.toThrow('cancelled');
    queueMicrotask(() => controller.abort(new Error('cancelled')));
    await rejected;
    expect(runtime.stop).toHaveBeenCalledWith('worker');
    expect(runtime.send).not.toHaveBeenCalled();
  });

  it('aborts during verification, forwards cancellation and never publishes', async () => {
    const started = deferred<AbortSignal>();
    const { runtime, executor } = fixture({
      commandVerifier: (request) => {
        started.resolve(request.signal!);
        return new Promise<never>(() => {});
      },
    });
    const controller = new AbortController();
    const execution = executor.execute(
      pattern({ type: 'command', run: 'test' }),
      {},
      { signal: controller.signal }
    );
    const rejected = expect(execution).rejects.toThrow('cancelled');
    const verifierSignal = await started.promise;
    controller.abort(new Error('cancelled'));
    await rejected;
    expect(verifierSignal.aborted).toBe(true);
    expect(runtime.send).toHaveBeenCalledTimes(1);
    expect(runtime.stop).toHaveBeenCalledTimes(2);
  });

  it('bounds nested parallel work without deadlocking containers or reviews', async () => {
    const { runtime, executor } = fixture({ maxParallel: 1 });
    let active = 0;
    let maximum = 0;
    runtime.send.mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await tick();
      active--;
      return response('VERDICT: approve');
    });
    const input = pattern({ type: 'agent' });
    input.workflow.steps = [
      {
        type: 'parallel',
        steps: [
          {
            type: 'parallel',
            steps: [
              { type: 'assign', role: 'worker', task: 'A' },
              { type: 'assign', role: 'reviewer', task: 'B' },
            ],
          },
          {
            type: 'sequential',
            steps: [{ type: 'assign', role: 'worker', task: 'C' }],
          },
        ],
      },
    ];
    await executor.execute(input, {});
    expect(maximum).toBe(1);
    expect(runtime.send).toHaveBeenCalledTimes(5);
  });

  it('cancels an in-flight sibling when another parallel leaf fails', async () => {
    const { runtime, executor } = fixture({ maxParallel: 2 });
    runtime.send.mockImplementation(async (id: string) => {
      if (id === 'worker') {
        await tick();
        throw new Error('worker failed');
      }
      return new Promise<never>(() => {});
    });
    const input = pattern();
    input.workflow.steps = [
      {
        type: 'parallel',
        steps: [
          { type: 'assign', role: 'worker', task: 'fail' },
          { type: 'assign', role: 'reviewer', task: 'hang' },
        ],
      },
      ...input.workflow.steps,
    ];
    await expect(executor.execute(input, {})).rejects.toThrow('worker failed');
    expect(runtime.stop).toHaveBeenCalledTimes(2);
    expect(runtime.send).toHaveBeenCalledTimes(2);
  });

  it('does not report success when stopping owned workers fails', async () => {
    const { runtime, executor } = fixture();
    runtime.stop.mockRejectedValue(new Error('runtime unreachable'));
    const complete = vi.fn();
    executor.on('workflow_completed', complete);
    await expect(
      executor.execute(pattern(), {}, { executionId: 'cleanup-failed' })
    ).rejects.toThrow('Failed to stop');
    await expect(executor.cancelExecution('cleanup-failed')).rejects.toThrow(
      'Failed to stop'
    );
    expect(complete).not.toHaveBeenCalled();
  });

  it('bounds direct workflow cleanup when a worker never acknowledges stop', async () => {
    vi.useFakeTimers();
    const { runtime, executor } = fixture();
    runtime.stop.mockImplementation(() => new Promise<void>(() => {}));
    const completed = vi.fn();
    const failed = vi.fn();
    executor.on('workflow_completed', completed);
    executor.on('workflow_failed', failed);
    const result = executor
      .execute(pattern(), {}, { executionId: 'unreachable-cleanup' })
      .catch((error) => error);
    await vi.waitFor(() => expect(runtime.stop).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(10000);
    expect((await result).message).toContain('timed out after 10000ms');
    expect(completed).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('reconciliation required'),
      })
    );
    await expect(
      executor.cancelExecution('unreachable-cleanup')
    ).rejects.toThrow('reconciliation required');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops reachable workers during a stuck spawn and reconciles it after the cleanup deadline', async () => {
    vi.useFakeTimers();
    const spawned = deferred<{ id: string }>();
    const { runtime, executor } = fixture();
    runtime.spawn.mockImplementation(async (config) =>
      config.role === 'reviewer' ? spawned.promise : { id: 'worker' }
    );
    const result = executor
      .execute(pattern(), {}, { executionId: 'spawn-deadline' })
      .catch((error) => error);
    await vi.waitFor(() => expect(runtime.spawn).toHaveBeenCalledTimes(2));
    const cancellation = executor
      .cancelExecution('spawn-deadline')
      .catch((error) => error);
    await vi.waitFor(() => expect(runtime.stop).toHaveBeenCalledWith('worker'));
    await vi.advanceTimersByTimeAsync(10000);
    expect((await cancellation).message).toContain('reconciliation required');
    expect((await result).message).toContain('cleanup is incomplete');
    spawned.resolve({ id: 'late-reviewer' });
    await vi.waitFor(() =>
      expect(runtime.stop).toHaveBeenCalledWith('late-reviewer')
    );
    expect(runtime.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
