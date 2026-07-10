/**
 * Workflow Executor Thread Integration Tests
 *
 * Tests for org-chart workflow execution with thread-backed agents.
 * Verifies sequential step ordering, variable interpolation, parallel
 * execution, thread completion handling, and error propagation.
 */

import { EventEmitter } from 'node:events';
import type { ThreadEvent, ThreadHandle } from '@parallaxai/runtime-interface';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentRuntimeService } from '../../agent-runtime';
import type { OrgPattern, OrgRole } from '../types';
import { WorkflowExecutor } from '../workflow-executor';

const logger = pino({ level: 'silent' });

// ---------------------------------------------------------------------------
// Mock runtime service that simulates thread-backed agents
// ---------------------------------------------------------------------------
class MockThreadRuntimeService extends EventEmitter {
  private threadCounter = 0;
  public spawnedThreads: Array<{ id: string; input: any }> = [];
  public sentMessages: Array<{ threadId: string; input: any }> = [];
  public stoppedThreads: Set<string> = new Set();
  private subscriptions: Map<string, Array<(event: ThreadEvent) => void>> =
    new Map();

  /** Controls whether threads auto-complete after receiving a message */
  public autoComplete = true;
  /** When autoComplete is true, the simulated summary returned */
  public autoCompleteSummary = 'done';

  /** If set, the next sendToThread call will reject with this error */
  public nextSendError: Error | null = null;

  /** If set, the next thread will emit this event type instead of completing */
  public nextEventType: string | null = null;

  /**
   * Confidence values attached to successive turn completions (shifted per
   * sendToThread). Undefined entries emit no confidence signal.
   */
  public confidenceQueue: Array<number | undefined> = [];

  async spawnThread(input: any): Promise<ThreadHandle> {
    const id = `thread-${this.threadCounter++}`;
    this.spawnedThreads.push({ id, input });
    // Simulate the CLI agent booting: the executor's ready gate listens for
    // 'thread_event' emissions with type ready/thread_ready on the runtime
    setTimeout(() => {
      this.emit('thread_event', {
        event: { type: 'ready', thread_id: id },
      });
    }, 1);
    return {
      id,
      status: 'running',
    } as ThreadHandle;
  }

  async stopThread(threadId: string): Promise<void> {
    this.stoppedThreads.add(threadId);
  }

  async getThread(threadId: string): Promise<any> {
    // The executor reads completion/summary from thread.metadata
    return {
      id: threadId,
      status: 'completed',
      metadata: {
        completion: { summary: this.autoCompleteSummary },
        summary: this.autoCompleteSummary,
      },
    };
  }

  async sendToThread(threadId: string, input: any): Promise<void> {
    this.sentMessages.push({ threadId, input });

    if (this.nextSendError) {
      const err = this.nextSendError;
      this.nextSendError = null;
      throw err;
    }

    if (this.autoComplete) {
      // Simulate the thread completing asynchronously
      const eventType = this.nextEventType || 'thread_turn_complete';
      this.nextEventType = null;
      const confidence = this.confidenceQueue.shift();
      setTimeout(() => {
        this.emitThreadEvent(threadId, {
          type: eventType,
          threadId,
          timestamp: new Date().toISOString(),
          data:
            confidence !== undefined
              ? { data_json: JSON.stringify({ confidence }) }
              : undefined,
        } as any);
      }, 5);
    }
  }

  subscribeThread(
    threadId: string,
    callback: (event: ThreadEvent) => void
  ): () => void {
    const subs = this.subscriptions.get(threadId) || [];
    subs.push(callback);
    this.subscriptions.set(threadId, subs);

    return () => {
      const current = this.subscriptions.get(threadId) || [];
      this.subscriptions.set(
        threadId,
        current.filter((cb) => cb !== callback)
      );
    };
  }

  /** Manually fire a thread event (used by tests) */
  emitThreadEvent(threadId: string, event: ThreadEvent): void {
    const subs = this.subscriptions.get(threadId) || [];
    for (const cb of subs) {
      cb(event);
    }
  }

  // Stubs for non-thread agent operations (unused in these tests)
  async spawn(): Promise<any> {
    return {
      id: 'stub',
      name: 'stub',
      type: 'echo',
      status: 'ready',
      capabilities: [],
    };
  }
  async stop(): Promise<void> {}
  async send(): Promise<any> {
    return {
      id: 'msg',
      agentId: 'stub',
      type: 'response',
      content: 'ok',
      timestamp: new Date(),
    };
  }
  subscribe(): () => void {
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// Helper to build a minimal thread-enabled OrgPattern
// ---------------------------------------------------------------------------
function makeRole(overrides: Partial<OrgRole> & { id: string }): OrgRole {
  return {
    name: overrides.name || overrides.id,
    agentType: 'claude-code',
    capabilities: ['code'],
    threadConfig: { enabled: true },
    ...overrides,
  };
}

function makeOrgPattern(overrides: Partial<OrgPattern> = {}): OrgPattern {
  return {
    name: 'test-pattern',
    structure: {
      name: 'test',
      roles: {
        architect: makeRole({
          id: 'architect',
          name: 'Architect',
          singleton: true,
        }),
        engineer: makeRole({
          id: 'engineer',
          name: 'Engineer',
          reportsTo: 'architect',
          minInstances: 2,
        }),
        reviewer: makeRole({
          id: 'reviewer',
          name: 'Reviewer',
          singleton: true,
        }),
      },
    },
    workflow: {
      name: 'default',
      steps: [
        {
          type: 'assign',
          role: 'architect',
          task: 'Design the solution',
          input: '${input.task}',
        },
        {
          type: 'parallel',
          steps: [
            {
              type: 'assign',
              role: 'engineer',
              task: 'Implement based on: ${step_0_result}',
            },
            {
              type: 'assign',
              role: 'engineer',
              task: 'Implement based on: ${step_0_result}',
            },
          ],
        },
        { type: 'review', reviewer: 'reviewer', subject: '${step_1_result}' },
      ],
      output: 'step_2_result',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('WorkflowExecutor thread integration', () => {
  let runtime: MockThreadRuntimeService;

  beforeEach(() => {
    runtime = new MockThreadRuntimeService();
  });

  it('executes steps sequentially: architect first, then engineers, then reviewer', async () => {
    const executionOrder: string[] = [];
    const originalSend = runtime.sendToThread.bind(runtime);
    runtime.sendToThread = async (threadId: string, input: any) => {
      executionOrder.push(threadId);
      return originalSend(threadId, input);
    };

    const pattern = makeOrgPattern();
    const executor = new WorkflowExecutor(
      runtime as unknown as AgentRuntimeService,
      logger,
      { stepTimeout: 5000 }
    );

    const result = await executor.execute(pattern, { task: 'build feature X' });

    // 4 threads spawned: architect, engineer x2, reviewer
    expect(runtime.spawnedThreads).toHaveLength(4);

    // Step 0 (architect) should complete before step 1 (engineers)
    // executionOrder: [architect, engineer0, engineer1, reviewer]
    expect(executionOrder.length).toBe(4);
    // Architect runs first
    expect(executionOrder[0]).toBe('thread-0');
    // Reviewer runs last
    expect(executionOrder[3]).toBe('thread-3');

    expect(result.metrics.stepsExecuted).toBe(3);
    expect(result.patternName).toBe('test-pattern');
  });

  it('interpolates ${step_0_result} in later step tasks', async () => {
    runtime.autoCompleteSummary = 'architect plan ABC';

    const pattern = makeOrgPattern();
    const executor = new WorkflowExecutor(
      runtime as unknown as AgentRuntimeService,
      logger,
      { stepTimeout: 5000 }
    );

    await executor.execute(pattern, { task: 'build it' });

    // The engineer steps (messages index 1 and 2) should contain the architect's result
    const engineerMessages = runtime.sentMessages.filter(
      (m) => m.threadId === 'thread-1' || m.threadId === 'thread-2'
    );
    for (const msg of engineerMessages) {
      expect(msg.input.message).toContain('architect plan ABC');
    }
  });

  it('interpolates ${input.task} in step input', async () => {
    const pattern = makeOrgPattern();
    const executor = new WorkflowExecutor(
      runtime as unknown as AgentRuntimeService,
      logger,
      { stepTimeout: 5000 }
    );

    await executor.execute(pattern, { task: 'hello world' });

    // First message (architect) should have the input task interpolated
    const architectMsg = runtime.sentMessages[0];
    expect(architectMsg.input.message).toContain('hello world');
  });

  it('runs parallel steps concurrently', async () => {
    // Use a slow auto-complete to verify parallelism
    runtime.autoComplete = false;
    const _completionTimestamps: number[] = [];

    const pattern: OrgPattern = {
      name: 'parallel-test',
      structure: {
        name: 'test',
        roles: {
          worker: makeRole({ id: 'worker', name: 'Worker', minInstances: 3 }),
        },
      },
      workflow: {
        name: 'default',
        steps: [
          {
            type: 'parallel',
            steps: [
              { type: 'assign', role: 'worker', task: 'task A' },
              { type: 'assign', role: 'worker', task: 'task B' },
              { type: 'assign', role: 'worker', task: 'task C' },
            ],
          },
        ],
      },
    };

    const executor = new WorkflowExecutor(
      runtime as unknown as AgentRuntimeService,
      logger,
      { stepTimeout: 5000 }
    );

    const promise = executor.execute(pattern, {});

    // Wait a tick for sendToThread calls
    await new Promise((r) => setTimeout(r, 20));

    // All 3 messages should have been sent (parallel)
    expect(runtime.sentMessages).toHaveLength(3);

    // Now complete all threads
    for (const msg of runtime.sentMessages) {
      runtime.emitThreadEvent(msg.threadId, {
        type: 'thread_turn_complete',
        threadId: msg.threadId,
        timestamp: new Date().toISOString(),
      } as any);
    }

    const result = await promise;
    expect(result.metrics.stepsExecuted).toBe(1);
  });

  it('waits for thread_turn_complete before proceeding to next step', async () => {
    runtime.autoComplete = false;

    const pattern: OrgPattern = {
      name: 'wait-test',
      structure: {
        name: 'test',
        roles: {
          lead: makeRole({ id: 'lead', name: 'Lead', singleton: true }),
          worker: makeRole({ id: 'worker', name: 'Worker', singleton: true }),
        },
      },
      workflow: {
        name: 'default',
        steps: [
          { type: 'assign', role: 'lead', task: 'plan' },
          { type: 'assign', role: 'worker', task: 'build' },
        ],
      },
    };

    const executor = new WorkflowExecutor(
      runtime as unknown as AgentRuntimeService,
      logger,
      { stepTimeout: 5000 }
    );

    const promise = executor.execute(pattern, {});

    // Wait a tick — only lead should have received a message
    await new Promise((r) => setTimeout(r, 20));
    expect(runtime.sentMessages).toHaveLength(1);
    expect(runtime.sentMessages[0].threadId).toBe('thread-0');

    // Complete the lead thread
    runtime.emitThreadEvent('thread-0', {
      type: 'thread_turn_complete',
      threadId: 'thread-0',
      timestamp: new Date().toISOString(),
    } as any);

    // Wait a tick — now worker should get its message
    await new Promise((r) => setTimeout(r, 20));
    expect(runtime.sentMessages).toHaveLength(2);
    expect(runtime.sentMessages[1].threadId).toBe('thread-1');

    // Complete worker
    runtime.emitThreadEvent('thread-1', {
      type: 'thread_turn_complete',
      threadId: 'thread-1',
      timestamp: new Date().toISOString(),
    } as any);

    const result = await promise;
    expect(result.metrics.stepsExecuted).toBe(2);
  });

  it('rejects when a thread fails', async () => {
    runtime.autoComplete = false;

    const pattern: OrgPattern = {
      name: 'fail-test',
      structure: {
        name: 'test',
        roles: {
          worker: makeRole({ id: 'worker', name: 'Worker', singleton: true }),
        },
      },
      workflow: {
        name: 'default',
        steps: [{ type: 'assign', role: 'worker', task: 'do something' }],
      },
    };

    const executor = new WorkflowExecutor(
      runtime as unknown as AgentRuntimeService,
      logger,
      { stepTimeout: 5000 }
    );

    const promise = executor.execute(pattern, {});

    await new Promise((r) => setTimeout(r, 20));

    // Emit failure
    runtime.emitThreadEvent('thread-0', {
      type: 'thread_failed',
      threadId: 'thread-0',
      timestamp: new Date().toISOString(),
    } as any);

    await expect(promise).rejects.toThrow(
      'Thread thread-0 ended with thread_failed'
    );

    // Failure path DOES clean up: all spawned threads get stopped
    expect(runtime.stoppedThreads.size).toBe(runtime.spawnedThreads.length);
  });

  it('leaves threads alive after successful execution', async () => {
    // Intentional lifecycle: threads survive workflow completion so agents
    // can finish pushing code / creating PRs; cleanup only runs on failure
    const pattern = makeOrgPattern();
    const executor = new WorkflowExecutor(
      runtime as unknown as AgentRuntimeService,
      logger,
      { stepTimeout: 5000 }
    );

    await executor.execute(pattern, { task: 'test' });

    expect(runtime.spawnedThreads).toHaveLength(4);
    expect(runtime.stoppedThreads.size).toBe(0);
  });

  it('stores all step results in context variables, not just assign steps', async () => {
    // Use a simple pattern with a parallel step (non-assign) followed by an aggregate
    const pattern: OrgPattern = {
      name: 'store-test',
      structure: {
        name: 'test',
        roles: {
          worker: makeRole({ id: 'worker', name: 'Worker', minInstances: 2 }),
        },
      },
      workflow: {
        name: 'default',
        steps: [
          {
            type: 'parallel',
            steps: [
              { type: 'assign', role: 'worker', task: 'task A' },
              { type: 'assign', role: 'worker', task: 'task B' },
            ],
          },
          { type: 'aggregate', method: 'merge' },
        ],
        output: 'step_1_result',
      },
    };

    const executor = new WorkflowExecutor(
      runtime as unknown as AgentRuntimeService,
      logger,
      { stepTimeout: 5000 }
    );

    const result = await executor.execute(pattern, {});

    // The aggregate step should have been able to access step_0_result
    // (the parallel results), meaning it was stored even though it's not an assign step
    expect(result.steps).toHaveLength(2);
    expect(result.output).toBeDefined();
  });

  describe('confidence policy', () => {
    function policyPattern(policy: {
      accept?: number;
      retryBelow?: number;
      escalateBelow?: number;
    }): OrgPattern {
      return {
        name: 'policy-test',
        structure: {
          name: 'test',
          roles: {
            lead: makeRole({ id: 'lead', name: 'Lead', singleton: true }),
            worker: makeRole({
              id: 'worker',
              name: 'Worker',
              singleton: true,
              reportsTo: 'lead',
              confidence: policy,
            }),
          },
        },
        workflow: {
          name: 'default',
          steps: [{ type: 'assign', role: 'worker', task: 'do the thing' }],
          output: 'step_0_result',
        },
      };
    }

    const fullPolicy = { accept: 0.8, retryBelow: 0.6, escalateBelow: 0.4 };
    // Boot order: lead spawns first (thread-0), worker second (thread-1)
    const LEAD = 'thread-0';
    const WORKER = 'thread-1';

    function makeExecutor() {
      return new WorkflowExecutor(
        runtime as unknown as AgentRuntimeService,
        logger,
        { stepTimeout: 5000 }
      );
    }

    it('accepts a confident result without retry or escalation', async () => {
      runtime.confidenceQueue = [0.9];
      const executor = makeExecutor();
      const actions: string[] = [];
      executor.on('step_confidence', (e) => actions.push(e.action));

      await executor.execute(policyPattern(fullPolicy), {});

      expect(runtime.sentMessages).toHaveLength(1);
      expect(runtime.sentMessages[0].threadId).toBe(WORKER);
      expect(actions).toEqual(['accept']);
    });

    it('retries once with critique below retryBelow; best attempt wins', async () => {
      runtime.confidenceQueue = [0.5, 0.9];
      const executor = makeExecutor();
      const actions: string[] = [];
      executor.on('step_confidence', (e) => actions.push(e.action));

      await executor.execute(policyPattern(fullPolicy), {});

      // Two messages, both to the worker; the retry carries the critique
      expect(runtime.sentMessages).toHaveLength(2);
      expect(runtime.sentMessages[0].threadId).toBe(WORKER);
      expect(runtime.sentMessages[1].threadId).toBe(WORKER);
      expect(runtime.sentMessages[1].input.message).toContain(
        'did not pass verification (0.50)'
      );
      expect(actions).toEqual(['retry', 'accept']);
    });

    it('escalates to the supervisor below escalateBelow', async () => {
      // Worker answers at 0.2; the supervisor's review completes at 0.95
      runtime.confidenceQueue = [0.2, 0.95];
      const executor = makeExecutor();
      const actions: string[] = [];
      executor.on('step_confidence', (e) => actions.push(e.action));

      await executor.execute(policyPattern(fullPolicy), {});

      expect(runtime.sentMessages).toHaveLength(2);
      expect(runtime.sentMessages[0].threadId).toBe(WORKER);
      // Escalation goes to the lead with the low-confidence context
      expect(runtime.sentMessages[1].threadId).toBe(LEAD);
      expect(runtime.sentMessages[1].input.message).toContain(
        'confidence 0.20'
      );
      expect(runtime.sentMessages[1].input.message).toContain('Worker');
      expect(actions).toEqual(['escalate']);
    });

    it('surfaces low confidence unrouted when the role has no supervisor', async () => {
      runtime.confidenceQueue = [0.2];
      const pattern = policyPattern(fullPolicy);
      pattern.structure.roles.worker.reportsTo = undefined;
      const executor = makeExecutor();
      const actions: string[] = [];
      executor.on('step_confidence', (e) => actions.push(e.action));

      await executor.execute(pattern, {});

      expect(runtime.sentMessages).toHaveLength(1);
      expect(actions).toEqual(['escalation_unrouted']);
    });

    it('passes results without a confidence signal through untouched', async () => {
      runtime.confidenceQueue = [undefined];
      const executor = makeExecutor();
      const actions: string[] = [];
      executor.on('step_confidence', (e) => actions.push(e.action));

      const result = await executor.execute(policyPattern(fullPolicy), {});

      expect(runtime.sentMessages).toHaveLength(1);
      expect(actions).toEqual(['no_signal']);
      expect(result.metrics.stepsExecuted).toBe(1);
    });

    it('accepts with a warning between escalateBelow and accept', async () => {
      runtime.confidenceQueue = [0.7];
      const executor = makeExecutor();
      const actions: string[] = [];
      executor.on('step_confidence', (e) => actions.push(e.action));

      await executor.execute(
        policyPattern({ accept: 0.8, escalateBelow: 0.4 }),
        {}
      );

      expect(runtime.sentMessages).toHaveLength(1);
      expect(actions).toEqual(['accept_with_warning']);
    });
  });

  describe('verify (command oracle)', () => {
    function verifyPattern(
      verify: unknown,
      policy?: { accept?: number; retryBelow?: number; escalateBelow?: number }
    ): OrgPattern {
      return {
        name: 'verify-test',
        structure: {
          name: 'test',
          roles: {
            lead: makeRole({ id: 'lead', name: 'Lead', singleton: true }),
            worker: makeRole({
              id: 'worker',
              name: 'Worker',
              singleton: true,
              reportsTo: 'lead',
              verify: verify as never,
              confidence: policy,
            }),
          },
        },
        workflow: {
          name: 'default',
          steps: [{ type: 'assign', role: 'worker', task: 'do the thing' }],
          output: 'step_0_result',
        },
      };
    }

    const fullPolicy = { accept: 0.8, retryBelow: 0.6, escalateBelow: 0.4 };
    const LEAD = 'thread-0';
    const WORKER = 'thread-1';

    function makeExecutor() {
      return new WorkflowExecutor(
        runtime as unknown as AgentRuntimeService,
        logger,
        { stepTimeout: 5000 }
      );
    }

    it('command exit 0 → verified pass → accept', async () => {
      const executor = makeExecutor();
      const events: any[] = [];
      executor.on('step_confidence', (e) => events.push(e));

      await executor.execute(
        verifyPattern({ type: 'command', run: 'true' }, fullPolicy),
        {}
      );

      // No retry/escalate: only the initial worker turn was sent.
      expect(runtime.sentMessages).toHaveLength(1);
      expect(runtime.sentMessages[0].threadId).toBe(WORKER);
      expect(events.map((e) => e.action)).toEqual(['accept']);
      expect(events[0].source).toContain('command');
    });

    it('command non-zero exit → verified fail → escalate to supervisor', async () => {
      const executor = makeExecutor();
      const events: any[] = [];
      executor.on('step_confidence', (e) => events.push(e));

      await executor.execute(
        verifyPattern({ type: 'command', run: 'false' }, fullPolicy),
        {}
      );

      // 0.0 < escalateBelow (0.4) → escalate to the lead.
      expect(runtime.sentMessages).toHaveLength(2);
      expect(runtime.sentMessages[1].threadId).toBe(LEAD);
      const escalate = events.find((e) => e.action === 'escalate');
      expect(escalate).toBeDefined();
      expect(escalate.source).toContain('command');
      // The escalation message carries the failing-verification context.
      expect(runtime.sentMessages[1].input.message).toContain(
        'did not pass'
      );
    });

    it('verify with no explicit confidence policy still escalates on failure', async () => {
      const executor = makeExecutor();
      const events: any[] = [];
      executor.on('step_confidence', (e) => events.push(e));

      // No policy arg → defaults (accept 0.8 / retryBelow 0.6 / escalateBelow 0.4).
      await executor.execute(
        verifyPattern({ type: 'command', run: 'false' }),
        {}
      );

      expect(events.some((e) => e.action === 'escalate')).toBe(true);
    });

    it('scorePattern partial score routes to the retry band', async () => {
      const executor = makeExecutor();
      const events: any[] = [];
      executor.on('step_confidence', (e) => events.push(e));

      // 2 passed / 2 failed = 0.5 → escalateBelow(0.4) ≤ 0.5 < retryBelow(0.6) → retry.
      await executor.execute(
        verifyPattern(
          {
            type: 'command',
            run: 'echo "2 passed, 2 failed"',
            scorePattern: '(\\d+) passed, (\\d+) failed',
          },
          fullPolicy
        ),
        {}
      );

      // Initial + one retry, both to the worker.
      expect(runtime.sentMessages).toHaveLength(2);
      expect(runtime.sentMessages[1].threadId).toBe(WORKER);
      expect(events.map((e) => e.action)).toEqual([
        'retry',
        'accept_with_warning',
      ]);
      // The retry critique carries the verification detail.
      expect(runtime.sentMessages[1].input.message).toContain(
        'did not pass verification'
      );
    });

    it('verify overrides a high self-reported confidence', async () => {
      // Agent claims 0.95, but the command says the work fails.
      runtime.confidenceQueue = [0.95];
      const executor = makeExecutor();
      const events: any[] = [];
      executor.on('step_confidence', (e) => events.push(e));

      await executor.execute(
        verifyPattern({ type: 'command', run: 'false' }, fullPolicy),
        {}
      );

      // Verification (0.0) wins over the self-report → escalate.
      const escalate = events.find((e) => e.action === 'escalate');
      expect(escalate).toBeDefined();
      expect(escalate.source).toContain('command');
    });
  });
});
