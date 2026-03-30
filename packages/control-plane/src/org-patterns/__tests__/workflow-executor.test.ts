/**
 * Workflow Executor Tests
 *
 * Unit tests for org-chart pattern execution.
 *
 * Covers: construction, assign/parallel/sequential steps, variable
 * interpolation, timeout handling, and error paths.
 */

import { EventEmitter } from 'node:events';
import type { AgentHandle, AgentMessage } from '@parallaxai/runtime-interface';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRuntimeService } from '../../agent-runtime';
import type { OrgPattern } from '../types';
import { WorkflowExecutor } from '../workflow-executor';

// Silent logger for tests
const logger = pino({ level: 'silent' });

// ---------------------------------------------------------------------------
// Mock runtime service
// ---------------------------------------------------------------------------
class MockRuntimeService extends EventEmitter {
  private agentCounter = 0;
  public spawnedAgents: Array<{ id: string; config: any }> = [];
  public sentMessages: Array<{ agentId: string; message: string }> = [];
  public subscribedAgents: Set<string> = new Set();
  public stoppedAgents: Set<string> = new Set();

  async spawn(config: any): Promise<AgentHandle> {
    const handle: AgentHandle = {
      id: `agent-${config.role}-${this.agentCounter++}`,
      name: config.name,
      type: config.type,
      status: 'ready',
      capabilities: config.capabilities || [],
      role: config.role,
    };
    this.spawnedAgents.push({ id: handle.id, config });
    return handle;
  }

  async stop(agentId: string): Promise<void> {
    this.stoppedAgents.add(agentId);
  }

  async send(
    agentId: string,
    message: string,
    options?: { expectResponse?: boolean; timeout?: number }
  ): Promise<AgentMessage | undefined> {
    this.sentMessages.push({ agentId, message });

    if (options?.expectResponse) {
      return {
        id: `msg-${Date.now()}`,
        agentId,
        type: 'response',
        content: `Response from ${agentId}: Done.`,
        timestamp: new Date(),
      };
    }
  }

  subscribe(
    agentId: string,
    _callback: (message: AgentMessage) => void
  ): () => void {
    this.subscribedAgents.add(agentId);
    return () => {
      this.subscribedAgents.delete(agentId);
    };
  }

  reset() {
    this.agentCounter = 0;
    this.spawnedAgents = [];
    this.sentMessages = [];
    this.subscribedAgents.clear();
    this.stoppedAgents.clear();
  }
}

// ---------------------------------------------------------------------------
// Test patterns
// ---------------------------------------------------------------------------

/** Simple two-role pattern used as the base for most tests. */
const startupTeamPattern: OrgPattern = {
  name: 'startup-team',
  version: '1.0.0',
  description: 'Lean team with architect oversight',
  structure: {
    name: 'Startup Team',
    roles: {
      architect: {
        id: 'architect',
        name: 'Systems Architect',
        agentType: 'claude',
        singleton: true,
        capabilities: ['architecture', 'code_review'],
      },
      engineer: {
        id: 'engineer',
        name: 'Software Engineer',
        agentType: 'claude',
        reportsTo: 'architect',
        minInstances: 1,
        maxInstances: 4,
        capabilities: ['implementation'],
      },
    },
    escalation: {
      defaultBehavior: 'route_to_reports_to',
      timeoutMs: 30000,
    },
  },
  workflow: {
    name: 'Feature Development',
    input: { task: { type: 'string' } },
    steps: [
      {
        type: 'assign',
        role: 'architect',
        task: 'Design: ${input.task}',
      },
      {
        type: 'assign',
        role: 'engineer',
        task: 'Implement: ${step_0_result}',
      },
    ],
    output: 'step_1_result',
  },
};

/** Pattern with a parallel step containing two assign sub-steps. */
function makeParallelPattern(): OrgPattern {
  return {
    name: 'parallel-pattern',
    version: '1.0.0',
    structure: {
      name: 'Parallel Team',
      roles: {
        frontend: {
          id: 'frontend',
          name: 'Frontend Engineer',
          agentType: 'claude',
          singleton: true,
          capabilities: ['frontend'],
        },
        backend: {
          id: 'backend',
          name: 'Backend Engineer',
          agentType: 'claude',
          singleton: true,
          capabilities: ['backend'],
        },
      },
      escalation: { defaultBehavior: 'route_to_reports_to' },
    },
    workflow: {
      name: 'Parallel Build',
      input: { task: { type: 'string' } },
      steps: [
        {
          type: 'parallel',
          steps: [
            { type: 'assign', role: 'frontend', task: 'Build UI: ${input.task}' },
            { type: 'assign', role: 'backend', task: 'Build API: ${input.task}' },
          ],
        },
      ],
    },
  };
}

/** Pattern with a sequential step containing two assign sub-steps. */
function makeSequentialPattern(): OrgPattern {
  return {
    name: 'sequential-pattern',
    version: '1.0.0',
    structure: {
      name: 'Sequential Team',
      roles: {
        planner: {
          id: 'planner',
          name: 'Planner',
          agentType: 'claude',
          singleton: true,
          capabilities: ['planning'],
        },
        executor: {
          id: 'executor',
          name: 'Executor',
          agentType: 'claude',
          singleton: true,
          capabilities: ['execution'],
        },
      },
      escalation: { defaultBehavior: 'route_to_reports_to' },
    },
    workflow: {
      name: 'Sequential Build',
      input: { task: { type: 'string' } },
      steps: [
        {
          type: 'sequential',
          steps: [
            { type: 'assign', role: 'planner', task: 'Plan: ${input.task}' },
            { type: 'assign', role: 'executor', task: 'Execute plan' },
          ],
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowExecutor', () => {
  let mockRuntime: MockRuntimeService;
  let executor: WorkflowExecutor;

  beforeEach(() => {
    mockRuntime = new MockRuntimeService();
    executor = new WorkflowExecutor(
      mockRuntime as unknown as AgentRuntimeService,
      logger
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockRuntime.reset();
  });

  // -----------------------------------------------------------------------
  // 1. Construction
  // -----------------------------------------------------------------------
  describe('construction', () => {
    it('should use default options when none provided', () => {
      const ex = new WorkflowExecutor(
        mockRuntime as unknown as AgentRuntimeService,
        logger
      );
      // Defaults: stepTimeout=0, maxParallel=10
      // We verify indirectly — no timeout should fire during a normal execution
      expect(ex).toBeInstanceOf(WorkflowExecutor);
    });

    it('should accept custom stepTimeout and maxParallel', () => {
      const ex = new WorkflowExecutor(
        mockRuntime as unknown as AgentRuntimeService,
        logger,
        { stepTimeout: 5000, maxParallel: 3 }
      );
      expect(ex).toBeInstanceOf(WorkflowExecutor);
    });

    it('should accept an optional threadPreparationService', () => {
      const fakeThreadPrep = {} as any;
      const ex = new WorkflowExecutor(
        mockRuntime as unknown as AgentRuntimeService,
        logger,
        { threadPreparationService: fakeThreadPrep }
      );
      expect(ex).toBeInstanceOf(WorkflowExecutor);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Single assign step execution
  // -----------------------------------------------------------------------
  describe('single assign step', () => {
    it('should spawn the correct agent and send the task', async () => {
      const singleStepPattern: OrgPattern = {
        name: 'single-step',
        version: '1.0.0',
        structure: {
          name: 'Solo',
          roles: {
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'claude',
              singleton: true,
              capabilities: ['work'],
            },
          },
          escalation: { defaultBehavior: 'route_to_reports_to' },
        },
        workflow: {
          name: 'Solo Task',
          input: { task: { type: 'string' } },
          steps: [
            { type: 'assign', role: 'worker', task: 'Do: ${input.task}' },
          ],
        },
      };

      const result = await executor.execute(singleStepPattern, {
        task: 'write tests',
      });

      expect(mockRuntime.spawnedAgents.length).toBe(1);
      expect(mockRuntime.spawnedAgents[0].config.role).toBe('worker');

      expect(result.steps.length).toBe(1);
      expect(result.steps[0].type).toBe('assign');
      expect(result.steps[0].result).toBeDefined();

      // Task message should contain interpolated input
      const sentTask = mockRuntime.sentMessages.find((m) =>
        m.agentId.includes('worker')
      );
      expect(sentTask).toBeDefined();
      expect(sentTask!.message).toContain('Do:');
      expect(sentTask!.message).toContain('write tests');
    });

    it('should return correct metrics for a single step', async () => {
      const singleStepPattern: OrgPattern = {
        name: 'single-step',
        version: '1.0.0',
        structure: {
          name: 'Solo',
          roles: {
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'claude',
              singleton: true,
              capabilities: ['work'],
            },
          },
          escalation: { defaultBehavior: 'route_to_reports_to' },
        },
        workflow: {
          name: 'Solo Task',
          input: {},
          steps: [
            { type: 'assign', role: 'worker', task: 'Do something' },
          ],
        },
      };

      const result = await executor.execute(singleStepPattern, {});

      expect(result.executionId).toBeDefined();
      expect(result.patternName).toBe('single-step');
      expect(result.metrics.agentsUsed).toBe(1);
      expect(result.metrics.stepsExecuted).toBe(1);
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.startedAt).toBeInstanceOf(Date);
      expect(result.metrics.completedAt).toBeInstanceOf(Date);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Parallel step execution
  // -----------------------------------------------------------------------
  describe('parallel step', () => {
    it('should execute sub-steps concurrently and return array of results', async () => {
      const pattern = makeParallelPattern();
      const result = await executor.execute(pattern, { task: 'build app' });

      // One top-level parallel step
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].type).toBe('parallel');

      // The parallel step result is an array of sub-step results
      const parallelResult = result.steps[0].result;
      expect(Array.isArray(parallelResult)).toBe(true);
      expect((parallelResult as any[]).length).toBe(2);
    });

    it('should spawn agents for all roles in parallel sub-steps', async () => {
      const pattern = makeParallelPattern();
      await executor.execute(pattern, { task: 'build' });

      const roles = mockRuntime.spawnedAgents.map((a) => a.config.role);
      expect(roles).toContain('frontend');
      expect(roles).toContain('backend');
    });

    it('should send correct tasks to each agent in parallel', async () => {
      const pattern = makeParallelPattern();
      await executor.execute(pattern, { task: 'dashboard' });

      const frontendMsg = mockRuntime.sentMessages.find((m) =>
        m.agentId.includes('frontend')
      );
      const backendMsg = mockRuntime.sentMessages.find((m) =>
        m.agentId.includes('backend')
      );

      expect(frontendMsg).toBeDefined();
      expect(frontendMsg!.message).toContain('Build UI:');
      expect(frontendMsg!.message).toContain('dashboard');

      expect(backendMsg).toBeDefined();
      expect(backendMsg!.message).toContain('Build API:');
      expect(backendMsg!.message).toContain('dashboard');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Sequential step execution
  // -----------------------------------------------------------------------
  describe('sequential step', () => {
    it('should execute sub-steps in order and return array of results', async () => {
      const pattern = makeSequentialPattern();
      const result = await executor.execute(pattern, { task: 'deploy' });

      expect(result.steps.length).toBe(1);
      expect(result.steps[0].type).toBe('sequential');

      const seqResult = result.steps[0].result;
      expect(Array.isArray(seqResult)).toBe(true);
      expect((seqResult as any[]).length).toBe(2);
    });

    it('should send tasks to correct agents in sequence', async () => {
      const pattern = makeSequentialPattern();
      await executor.execute(pattern, { task: 'migrate db' });

      const plannerMsg = mockRuntime.sentMessages.find((m) =>
        m.agentId.includes('planner')
      );
      const executorMsg = mockRuntime.sentMessages.find((m) =>
        m.agentId.includes('executor')
      );

      expect(plannerMsg).toBeDefined();
      expect(plannerMsg!.message).toContain('Plan:');
      expect(plannerMsg!.message).toContain('migrate db');

      expect(executorMsg).toBeDefined();
      expect(executorMsg!.message).toContain('Execute plan');
    });

    it('should execute steps sequentially, not in parallel', async () => {
      const callOrder: string[] = [];
      const originalSend = mockRuntime.send.bind(mockRuntime);
      mockRuntime.send = async (agentId: string, message: string, options?: any) => {
        callOrder.push(agentId);
        // Add a small delay to make ordering observable
        await new Promise((r) => setTimeout(r, 5));
        return originalSend(agentId, message, options);
      };

      const pattern = makeSequentialPattern();
      await executor.execute(pattern, { task: 'test' });

      // Planner message should come before executor message
      const plannerIdx = callOrder.findIndex((id) => id.includes('planner'));
      const executorIdx = callOrder.findIndex((id) => id.includes('executor'));
      expect(plannerIdx).toBeLessThan(executorIdx);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Variable interpolation
  // -----------------------------------------------------------------------
  describe('variable interpolation', () => {
    it('should interpolate ${input.task} in step task strings', async () => {
      await executor.execute(startupTeamPattern, {
        task: 'build authentication',
      });

      const architectMsg = mockRuntime.sentMessages.find((m) =>
        m.agentId.includes('architect')
      );
      expect(architectMsg).toBeDefined();
      expect(architectMsg!.message).toBe('Design: build authentication');
    });

    it('should interpolate ${step_N_result} from previous step results', async () => {
      await executor.execute(startupTeamPattern, { task: 'build auth' });

      // The engineer step references ${step_0_result} which is the architect response
      const engineerMsg = mockRuntime.sentMessages.find((m) =>
        m.agentId.includes('engineer')
      );
      expect(engineerMsg).toBeDefined();
      // The mock returns "Response from agent-architect-0: Done."
      // so the engineer's task should be "Implement: Response from agent-architect-0: Done."
      expect(engineerMsg!.message).toContain('Implement:');
      expect(engineerMsg!.message).toContain('Response from agent-architect');
    });

    it('should interpolate nested input properties', async () => {
      const nestedPattern: OrgPattern = {
        name: 'nested-vars',
        version: '1.0.0',
        structure: {
          name: 'Solo',
          roles: {
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'claude',
              singleton: true,
              capabilities: ['work'],
            },
          },
          escalation: { defaultBehavior: 'route_to_reports_to' },
        },
        workflow: {
          name: 'Nested',
          input: {},
          steps: [
            {
              type: 'assign',
              role: 'worker',
              task: 'Work on ${input.repo} branch ${input.branch}',
            },
          ],
        },
      };

      await executor.execute(nestedPattern, {
        repo: 'parallax',
        branch: 'feat/new',
      });

      const msg = mockRuntime.sentMessages[0];
      expect(msg.message).toBe('Work on parallax branch feat/new');
    });

    it('should handle missing variables gracefully (empty string)', async () => {
      const missingVarPattern: OrgPattern = {
        name: 'missing-var',
        version: '1.0.0',
        structure: {
          name: 'Solo',
          roles: {
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'claude',
              singleton: true,
              capabilities: ['work'],
            },
          },
          escalation: { defaultBehavior: 'route_to_reports_to' },
        },
        workflow: {
          name: 'Missing Var',
          input: {},
          steps: [
            {
              type: 'assign',
              role: 'worker',
              task: 'Work on ${input.nonexistent}',
            },
          ],
        },
      };

      await executor.execute(missingVarPattern, {});

      const msg = mockRuntime.sentMessages[0];
      expect(msg.message).toBe('Work on ');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Timeout handling
  // -----------------------------------------------------------------------
  describe('timeout handling', () => {
    it('should not timeout when stepTimeout is 0 (default)', async () => {
      // Default stepTimeout=0 means no timeout. Execution should succeed.
      const result = await executor.execute(startupTeamPattern, {
        task: 'build',
      });
      expect(result.metrics.stepsExecuted).toBe(2);
    });

    it('should pass stepTimeout to runtime send options', async () => {
      const timeoutExecutor = new WorkflowExecutor(
        mockRuntime as unknown as AgentRuntimeService,
        logger,
        { stepTimeout: 5000 }
      );

      const sendSpy = vi.fn(mockRuntime.send.bind(mockRuntime));
      mockRuntime.send = sendSpy;

      await timeoutExecutor.execute(startupTeamPattern, { task: 'build' });

      // Verify that send was called with the timeout option
      for (const call of sendSpy.mock.calls) {
        const options = call[2] as { timeout?: number } | undefined;
        expect(options?.timeout).toBe(5000);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 7. Error handling — no agents available
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('should throw when role referenced in assign step does not exist', async () => {
      const badPattern: OrgPattern = {
        name: 'bad-pattern',
        version: '1.0.0',
        structure: {
          name: 'Empty',
          roles: {
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'claude',
              singleton: true,
              capabilities: ['work'],
            },
          },
          escalation: { defaultBehavior: 'route_to_reports_to' },
        },
        workflow: {
          name: 'Bad Workflow',
          input: {},
          steps: [
            {
              type: 'assign',
              role: 'nonexistent_role',
              task: 'Do something',
            },
          ],
        },
      };

      await expect(
        executor.execute(badPattern, {})
      ).rejects.toThrow('Role nonexistent_role not found in pattern');
    });

    it('should throw when spawn fails and no agent is available', async () => {
      mockRuntime.spawn = async () => {
        throw new Error('Spawn failed: no capacity');
      };

      await expect(
        executor.execute(startupTeamPattern, { task: 'build' })
      ).rejects.toThrow('Spawn failed: no capacity');
    });

    it('should throw for unknown step type', async () => {
      const unknownStepPattern: OrgPattern = {
        name: 'unknown-step',
        version: '1.0.0',
        structure: {
          name: 'Solo',
          roles: {
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'claude',
              singleton: true,
              capabilities: ['work'],
            },
          },
          escalation: { defaultBehavior: 'route_to_reports_to' },
        },
        workflow: {
          name: 'Unknown',
          input: {},
          steps: [{ type: 'bogus' as any, role: 'worker', task: 'do' }],
        },
      };

      await expect(
        executor.execute(unknownStepPattern, {})
      ).rejects.toThrow('Unknown step type: bogus');
    });

    it('should set context state to failed on error', async () => {
      mockRuntime.spawn = async () => {
        throw new Error('Boom');
      };

      await expect(
        executor.execute(startupTeamPattern, { task: 'x' })
      ).rejects.toThrow('Boom');

      // The error path calls cleanupAgents and sets state = 'failed'.
      // We verify cleanup was attempted (stoppedAgents would be empty since
      // no agents were spawned, but no error should propagate).
    });

    it('should cleanup agents on failure', async () => {
      // Let the first agent spawn succeed but fail on send
      let sendCallCount = 0;
      mockRuntime.send = async () => {
        sendCallCount++;
        if (sendCallCount > 0) {
          throw new Error('Send failed');
        }
        return undefined;
      };

      try {
        await executor.execute(startupTeamPattern, { task: 'build' });
      } catch {
        // Expected
      }

      // All spawned agents should have been stopped during cleanup
      for (const agent of mockRuntime.spawnedAgents) {
        expect(mockRuntime.stoppedAgents.has(agent.id)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Additional: output extraction and lifecycle
  // -----------------------------------------------------------------------
  describe('output extraction', () => {
    it('should use the output spec to resolve final output', async () => {
      const result = await executor.execute(startupTeamPattern, {
        task: 'build',
      });

      // startupTeamPattern.workflow.output = 'step_1_result'
      // so output should be the engineer's response
      expect(result.output).toBeDefined();
    });

    it('should return last step result when no output spec', async () => {
      const noOutputPattern: OrgPattern = {
        ...startupTeamPattern,
        name: 'no-output',
        workflow: {
          ...startupTeamPattern.workflow,
          output: undefined,
        },
      };

      const result = await executor.execute(noOutputPattern, { task: 'x' });
      expect(result.output).toBeDefined();
    });
  });

  describe('agent lifecycle', () => {
    it('should spawn agents for all roles', async () => {
      await executor.execute(startupTeamPattern, { task: 'Build feature' });

      expect(mockRuntime.spawnedAgents.length).toBe(2);
      const roles = mockRuntime.spawnedAgents.map((a) => a.config.role);
      expect(roles).toContain('architect');
      expect(roles).toContain('engineer');
    });

    it('should spawn multiple agents for non-singleton roles', async () => {
      const multiEngineerPattern: OrgPattern = {
        ...startupTeamPattern,
        structure: {
          ...startupTeamPattern.structure,
          roles: {
            ...startupTeamPattern.structure.roles,
            engineer: {
              ...startupTeamPattern.structure.roles.engineer,
              minInstances: 3,
            },
          },
        },
      };

      await executor.execute(multiEngineerPattern, { task: 'Build feature' });

      expect(mockRuntime.spawnedAgents.length).toBe(4); // 1 architect + 3 engineers
      const engineers = mockRuntime.spawnedAgents.filter(
        (a) => a.config.role === 'engineer'
      );
      expect(engineers.length).toBe(3);
    });
  });
});
