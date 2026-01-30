/**
 * Workflow Executor Tests
 *
 * Unit tests for org-chart pattern execution.
 *
 * Note: For full integration tests of message routing between real agents,
 * use the echo adapter with the local runtime. These unit tests verify
 * the wiring logic in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import pino from 'pino';
import { WorkflowExecutor } from '../workflow-executor';
import { OrgPattern } from '../types';
import { AgentRuntimeService } from '../../agent-runtime';
import { AgentHandle, AgentMessage } from '@parallax/runtime-interface';

// Create a silent logger for tests
const logger = pino({ level: 'silent' });

// Mock runtime service
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
  ): Promise<AgentMessage | void> {
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

  subscribe(agentId: string, callback: (message: AgentMessage) => void): () => void {
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

// Simple startup team pattern for testing
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
    input: {
      task: { type: 'string' },
    },
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

// Three-level hierarchy pattern
const enterprisePattern: OrgPattern = {
  name: 'enterprise-team',
  version: '1.0.0',
  description: 'Enterprise team with tech leads',
  structure: {
    name: 'Enterprise Team',
    roles: {
      architect: {
        id: 'architect',
        name: 'Chief Architect',
        agentType: 'claude',
        singleton: true,
        capabilities: ['architecture'],
      },
      tech_lead: {
        id: 'tech_lead',
        name: 'Tech Lead',
        agentType: 'claude',
        reportsTo: 'architect',
        minInstances: 1,
        capabilities: ['leadership', 'code_review'],
      },
      engineer: {
        id: 'engineer',
        name: 'Engineer',
        agentType: 'claude',
        reportsTo: 'tech_lead',
        minInstances: 1,
        capabilities: ['implementation'],
      },
    },
    escalation: {
      defaultBehavior: 'route_to_reports_to',
      timeoutMs: 30000,
      maxDepth: 3,
    },
  },
  workflow: {
    name: 'Enterprise Development',
    input: { task: { type: 'string' } },
    steps: [
      { type: 'assign', role: 'architect', task: 'Plan: ${input.task}' },
      { type: 'assign', role: 'tech_lead', task: 'Design: ${step_0_result}' },
      { type: 'assign', role: 'engineer', task: 'Implement: ${step_1_result}' },
    ],
    output: 'step_2_result',
  },
};

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

  describe('Agent Lifecycle', () => {
    it('should spawn agents for all roles', async () => {
      await executor.execute(startupTeamPattern, { task: 'Build feature' });

      // Check that agents were spawned for both roles
      expect(mockRuntime.spawnedAgents.length).toBe(2);

      const roles = mockRuntime.spawnedAgents.map(a => a.config.role);
      expect(roles).toContain('architect');
      expect(roles).toContain('engineer');
    });

    it('should stop all agents after execution', async () => {
      await executor.execute(startupTeamPattern, { task: 'Build feature' });

      // All spawned agents should be stopped
      expect(mockRuntime.stoppedAgents.size).toBe(2);
      for (const agent of mockRuntime.spawnedAgents) {
        expect(mockRuntime.stoppedAgents.has(agent.id)).toBe(true);
      }
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

      // Should spawn 1 architect + 3 engineers
      expect(mockRuntime.spawnedAgents.length).toBe(4);

      const engineers = mockRuntime.spawnedAgents.filter(a => a.config.role === 'engineer');
      expect(engineers.length).toBe(3);
    });
  });

  describe('Workflow Execution', () => {
    it('should execute all workflow steps in order', async () => {
      const result = await executor.execute(startupTeamPattern, {
        task: 'Build user authentication',
      });

      expect(result.steps.length).toBe(2);
      expect(result.steps[0].type).toBe('assign');
      expect(result.steps[1].type).toBe('assign');
    });

    it('should return correct execution metrics', async () => {
      const result = await executor.execute(startupTeamPattern, {
        task: 'Build feature',
      });

      expect(result.executionId).toBeDefined();
      expect(result.patternName).toBe('startup-team');
      expect(result.metrics.agentsUsed).toBe(2);
      expect(result.metrics.stepsExecuted).toBe(2);
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should send tasks to correct agents', async () => {
      await executor.execute(startupTeamPattern, {
        task: 'Build authentication',
      });

      // Should have sent messages to both agents
      expect(mockRuntime.sentMessages.length).toBeGreaterThanOrEqual(2);

      const messages = mockRuntime.sentMessages.map(m => m.message);
      expect(messages.some(m => m.includes('Design:'))).toBe(true);
      expect(messages.some(m => m.includes('Implement:'))).toBe(true);
    });

    it('should handle three-level hierarchy', async () => {
      const result = await executor.execute(enterprisePattern, {
        task: 'Build enterprise feature',
      });

      expect(result.metrics.agentsUsed).toBe(3); // architect + tech_lead + engineer
      expect(result.steps.length).toBe(3);
    });
  });

  describe('Message Subscriptions', () => {
    it('should subscribe to all agents during execution', async () => {
      // Track subscriptions that happened
      let subscriptionCount = 0;
      const originalSubscribe = mockRuntime.subscribe.bind(mockRuntime);
      mockRuntime.subscribe = (agentId: string, callback: any) => {
        subscriptionCount++;
        return originalSubscribe(agentId, callback);
      };

      await executor.execute(startupTeamPattern, { task: 'Build feature' });

      // Should have subscribed to both architect and engineer
      expect(subscriptionCount).toBe(2);
    });

    it('should unsubscribe all agents after completion', async () => {
      await executor.execute(startupTeamPattern, { task: 'Build feature' });

      // After completion, subscriptions should be cleaned up
      expect(mockRuntime.subscribedAgents.size).toBe(0);
    });

    it('should unsubscribe on error', async () => {
      // Make the second send fail
      let callCount = 0;
      mockRuntime.send = async () => {
        callCount++;
        if (callCount > 1) {
          throw new Error('Network error');
        }
        return {
          id: 'msg-1',
          agentId: 'test',
          type: 'response',
          content: 'OK',
          timestamp: new Date(),
        };
      };

      try {
        await executor.execute(startupTeamPattern, { task: 'Build feature' });
      } catch {
        // Expected
      }

      // Subscriptions should still be cleaned up
      expect(mockRuntime.subscribedAgents.size).toBe(0);
    });
  });

  describe('Event Emission', () => {
    it('should emit lead_agent_message for top-level agents', async () => {
      const leadMessages: any[] = [];
      executor.on('lead_agent_message', (data) => {
        leadMessages.push(data);
      });

      // Create a mock that captures the callback and triggers it
      let architectCallback: ((msg: AgentMessage) => void) | null = null;
      mockRuntime.subscribe = (agentId: string, callback: any) => {
        if (agentId.includes('architect')) {
          architectCallback = callback;
        }
        mockRuntime.subscribedAgents.add(agentId);
        return () => mockRuntime.subscribedAgents.delete(agentId);
      };

      // Start execution but don't await yet
      const executePromise = executor.execute(startupTeamPattern, {
        task: 'Build feature',
      });

      // Give time for subscriptions to be set up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate the architect (top-level) sending a message
      if (architectCallback) {
        architectCallback({
          id: 'msg-test',
          agentId: 'agent-architect-0',
          type: 'message',
          content: 'Architecture design complete.',
          timestamp: new Date(),
        });
      }

      await executePromise;

      // Should have emitted lead_agent_message since architect has no reportsTo
      expect(leadMessages.length).toBeGreaterThanOrEqual(1);
      expect(leadMessages[0].role).toBe('architect');
    });
  });
});

describe('Org Hierarchy Patterns', () => {
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
    mockRuntime.reset();
  });

  it('should handle pair programming pattern', async () => {
    const pairPattern: OrgPattern = {
      name: 'pair-programming',
      version: '1.0.0',
      description: 'Driver/Navigator pair',
      structure: {
        name: 'Pair',
        roles: {
          navigator: {
            id: 'navigator',
            name: 'Navigator',
            agentType: 'claude',
            singleton: true,
            capabilities: ['planning'],
          },
          driver: {
            id: 'driver',
            name: 'Driver',
            agentType: 'claude',
            singleton: true,
            reportsTo: 'navigator',
            capabilities: ['implementation'],
          },
        },
        escalation: {
          defaultBehavior: 'route_to_reports_to',
        },
      },
      workflow: {
        name: 'Pair Session',
        input: { task: { type: 'string' } },
        steps: [
          { type: 'assign', role: 'navigator', task: 'Plan: ${input.task}' },
          { type: 'assign', role: 'driver', task: 'Implement: ${step_0_result}' },
        ],
        output: 'step_1_result',
      },
    };

    const result = await executor.execute(pairPattern, {
      task: 'Implement feature',
    });

    expect(result.metrics.agentsUsed).toBe(2);
    expect(result.steps.length).toBe(2);

    // Verify correct roles were spawned
    const roles = mockRuntime.spawnedAgents.map(a => a.config.role);
    expect(roles).toContain('navigator');
    expect(roles).toContain('driver');
  });

  it('should handle review workflow step', async () => {
    const reviewPattern: OrgPattern = {
      name: 'review-pattern',
      version: '1.0.0',
      description: 'Pattern with review step',
      structure: {
        name: 'Review Team',
        roles: {
          developer: {
            id: 'developer',
            name: 'Developer',
            agentType: 'claude',
            singleton: true,
            capabilities: ['implementation'],
          },
          reviewer: {
            id: 'reviewer',
            name: 'Reviewer',
            agentType: 'claude',
            singleton: true,
            capabilities: ['code_review'],
          },
        },
        escalation: { defaultBehavior: 'route_to_reports_to' },
      },
      workflow: {
        name: 'Review Workflow',
        input: { task: { type: 'string' } },
        steps: [
          { type: 'assign', role: 'developer', task: 'Implement: ${input.task}' },
          { type: 'review', reviewer: 'reviewer', subject: '$step_0_result' },
        ],
        output: 'step_1_result',
      },
    };

    const result = await executor.execute(reviewPattern, {
      task: 'Build feature',
    });

    expect(result.steps.length).toBe(2);
    expect(result.steps[1].type).toBe('review');
  });
});
