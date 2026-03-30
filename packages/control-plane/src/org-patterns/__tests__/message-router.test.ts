import { describe, expect, it, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { MessageRouter } from '../message-router';
import type {
  OrgAgentInstance,
  OrgExecutionContext,
  OrgPattern,
  OrgStructure,
} from '../types';

const logger = pino({ level: 'silent' });

function makeStructure(
  overrides: Partial<OrgStructure> = {}
): OrgStructure {
  return {
    name: 'test-org',
    roles: {
      lead: {
        id: 'lead',
        name: 'Lead',
        agentType: 'claude-code',
        capabilities: ['planning'],
        singleton: true,
      },
      worker: {
        id: 'worker',
        name: 'Worker',
        agentType: 'claude-code',
        capabilities: ['coding'],
        reportsTo: 'lead',
        minInstances: 2,
      },
    },
    ...overrides,
  };
}

function makeContext(
  agents: OrgAgentInstance[] = [],
  roleAssignments: Record<string, string[]> = {}
): OrgExecutionContext {
  const agentMap = new Map<string, OrgAgentInstance>();
  for (const a of agents) agentMap.set(a.id, a);

  return {
    id: 'exec-1',
    pattern: { name: 'test', structure: makeStructure(), workflow: { name: 'w', steps: [] } },
    agents: agentMap,
    roleAssignments: new Map(Object.entries(roleAssignments)),
    state: 'running',
    variables: new Map(),
    startedAt: new Date(),
  };
}

function makeAgent(
  id: string,
  role: string,
  status: 'idle' | 'busy' = 'idle'
): OrgAgentInstance {
  return { id, role, endpoint: `${id}:50051`, status };
}

describe('MessageRouter', () => {
  describe('routeTask', () => {
    it('routes task to first available idle agent', async () => {
      const agents = [
        makeAgent('w1', 'worker', 'busy'),
        makeAgent('w2', 'worker', 'idle'),
      ];
      const context = makeContext(agents, {
        worker: ['w1', 'w2'],
      });
      const router = new MessageRouter(makeStructure(), context, logger);

      const result = await router.routeTask('lead', 'worker', 'code it');
      expect(result).toEqual(['w2']);
    });

    it('falls back to first agent when all busy', async () => {
      const agents = [
        makeAgent('w1', 'worker', 'busy'),
        makeAgent('w2', 'worker', 'busy'),
      ];
      const context = makeContext(agents, {
        worker: ['w1', 'w2'],
      });
      const router = new MessageRouter(makeStructure(), context, logger);

      const result = await router.routeTask('lead', 'worker', 'code it');
      expect(result).toEqual(['w1']);
    });

    it('throws when no agents available for role', async () => {
      const context = makeContext([], { worker: [] });
      const router = new MessageRouter(makeStructure(), context, logger);

      await expect(
        router.routeTask('lead', 'worker', 'code it')
      ).rejects.toThrow('No agents available for role: worker');
    });

    it('broadcasts to all agents when routing rule says broadcast', async () => {
      const agents = [
        makeAgent('w1', 'worker'),
        makeAgent('w2', 'worker'),
      ];
      const context = makeContext(agents, {
        lead: [],
        worker: ['w1', 'w2'],
      });
      const structure = makeStructure({
        routing: [
          {
            from: 'lead',
            to: 'worker',
            broadcast: true,
            messageTypes: ['task'],
          },
        ],
      });
      const router = new MessageRouter(structure, context, logger);

      const result = await router.routeTask('lead', 'worker', 'all hands');
      expect(result).toEqual(['w1', 'w2']);
    });
  });

  describe('handleQuestion', () => {
    it('routes question to reports_to role by default', async () => {
      const agents = [
        makeAgent('l1', 'lead'),
        makeAgent('w1', 'worker'),
      ];
      const context = makeContext(agents, {
        lead: ['l1'],
        worker: ['w1'],
      });
      const structure = makeStructure({
        escalation: {
          defaultBehavior: 'route_to_reports_to',
          onMaxDepth: 'surface_to_user',
        },
      });
      const router = new MessageRouter(structure, context, logger);

      const sendSpy = vi.fn();
      router.on('send_question', sendSpy);

      await router.handleQuestion('w1', 'How should I implement this?');

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toAgentId: 'l1',
          question: expect.objectContaining({
            agentId: 'w1',
            question: 'How should I implement this?',
          }),
        })
      );
    });

    it('throws when agent not found in context', async () => {
      const context = makeContext([], {});
      const router = new MessageRouter(makeStructure(), context, logger);

      await expect(
        router.handleQuestion('unknown', 'question')
      ).rejects.toThrow('Agent unknown not found in context');
    });

    it('routes by topic when topic routes configured', async () => {
      const agents = [
        makeAgent('l1', 'lead'),
        makeAgent('w1', 'worker'),
      ];
      const context = makeContext(agents, {
        lead: ['l1'],
        worker: ['w1'],
      });
      const structure = makeStructure({
        escalation: {
          defaultBehavior: 'route_to_reports_to',
          onMaxDepth: 'surface_to_user',
          topicRoutes: { architecture: 'lead' },
        },
      });
      const router = new MessageRouter(structure, context, logger);

      const sendSpy = vi.fn();
      router.on('send_question', sendSpy);

      await router.handleQuestion(
        'w1',
        'How should we structure this?',
        'architecture'
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ toAgentId: 'l1' })
      );
    });

    it('surfaces to user when no route available', async () => {
      const agents = [makeAgent('w1', 'worker')];
      const context = makeContext(agents, { worker: ['w1'] });
      // No escalation config, no reportsTo for lead
      const structure: OrgStructure = {
        name: 'flat',
        roles: {
          worker: {
            id: 'worker',
            name: 'Worker',
            agentType: 'claude-code',
            capabilities: ['coding'],
            // no reportsTo
          },
        },
      };
      const router = new MessageRouter(structure, context, logger);

      const surfaceSpy = vi.fn();
      router.on('surface_to_user', surfaceSpy);

      await router.handleQuestion('w1', 'What do I do?');

      expect(surfaceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'No route available',
        })
      );
    });
  });

  describe('provideAnswer', () => {
    it('emits answer and send_answer events', async () => {
      const agents = [
        makeAgent('l1', 'lead'),
        makeAgent('w1', 'worker'),
      ];
      const context = makeContext(agents, {
        lead: ['l1'],
        worker: ['w1'],
      });
      const structure = makeStructure({
        escalation: {
          defaultBehavior: 'route_to_reports_to',
          onMaxDepth: 'surface_to_user',
        },
      });
      const router = new MessageRouter(structure, context, logger);

      // Capture the question ID
      let questionId: string | undefined;
      router.on('send_question', (data) => {
        questionId = data.question.id;
      });

      await router.handleQuestion('w1', 'How?');
      expect(questionId).toBeDefined();

      const answerSpy = vi.fn();
      const sendAnswerSpy = vi.fn();
      router.on('answer', answerSpy);
      router.on('send_answer', sendAnswerSpy);

      await router.provideAnswer(questionId!, 'l1', 'Do it this way', 0.9);

      expect(answerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          answer: expect.objectContaining({
            agentId: 'l1',
            answer: 'Do it this way',
            confidence: 0.9,
          }),
        })
      );

      expect(sendAnswerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toAgentId: 'w1',
        })
      );
    });

    it('ignores answer for unknown question', async () => {
      const context = makeContext([], {});
      const router = new MessageRouter(makeStructure(), context, logger);

      // Should not throw
      await router.provideAnswer('unknown-q', 'l1', 'answer');
    });

    it('throws when answering agent not in context', async () => {
      const agents = [
        makeAgent('l1', 'lead'),
        makeAgent('w1', 'worker'),
      ];
      const context = makeContext(agents, {
        lead: ['l1'],
        worker: ['w1'],
      });
      const structure = makeStructure({
        escalation: {
          defaultBehavior: 'route_to_reports_to',
          onMaxDepth: 'surface_to_user',
        },
      });
      const router = new MessageRouter(structure, context, logger);

      let questionId: string | undefined;
      router.on('send_question', (data) => {
        questionId = data.question.id;
      });

      await router.handleQuestion('w1', 'Help?');

      await expect(
        router.provideAnswer(questionId!, 'nonexistent', 'answer')
      ).rejects.toThrow('Agent nonexistent not found');
    });
  });

  describe('getPendingQuestionsFor', () => {
    it('returns questions routed to an agent', async () => {
      const agents = [
        makeAgent('l1', 'lead'),
        makeAgent('w1', 'worker'),
      ];
      const context = makeContext(agents, {
        lead: ['l1'],
        worker: ['w1'],
      });
      const structure = makeStructure({
        escalation: {
          defaultBehavior: 'route_to_reports_to',
          onMaxDepth: 'surface_to_user',
        },
      });
      const router = new MessageRouter(structure, context, logger);

      router.on('send_question', () => {}); // consume event

      await router.handleQuestion('w1', 'Question 1');
      await router.handleQuestion('w1', 'Question 2');

      const pending = router.getPendingQuestionsFor('l1');
      expect(pending).toHaveLength(2);
      expect(pending[0].question).toBe('Question 1');
      expect(pending[1].question).toBe('Question 2');
    });

    it('returns empty array for agent with no pending questions', () => {
      const context = makeContext([], {});
      const router = new MessageRouter(makeStructure(), context, logger);

      expect(router.getPendingQuestionsFor('nobody')).toEqual([]);
    });
  });

  describe('escalation', () => {
    it('escalates through hierarchy when target role has no agents', async () => {
      // Structure: worker reports to lead, but lead has no agents
      // Should surface to user
      const agents = [makeAgent('w1', 'worker')];
      const context = makeContext(agents, {
        lead: [], // no lead agents
        worker: ['w1'],
      });
      const structure = makeStructure({
        escalation: {
          defaultBehavior: 'route_to_reports_to',
          onMaxDepth: 'surface_to_user',
        },
      });
      const router = new MessageRouter(structure, context, logger);

      const surfaceSpy = vi.fn();
      router.on('surface_to_user', surfaceSpy);

      await router.handleQuestion('w1', 'Nobody home?');

      // Lead has no agents, lead has no reportsTo → surface to user
      expect(surfaceSpy).toHaveBeenCalled();
    });

    it('stops at max escalation depth', async () => {
      // Create a deep hierarchy
      const structure: OrgStructure = {
        name: 'deep',
        roles: {
          ceo: {
            id: 'ceo',
            name: 'CEO',
            agentType: 'claude-code',
            capabilities: ['strategy'],
            singleton: true,
          },
          vp: {
            id: 'vp',
            name: 'VP',
            agentType: 'claude-code',
            capabilities: ['management'],
            reportsTo: 'ceo',
          },
          manager: {
            id: 'manager',
            name: 'Manager',
            agentType: 'claude-code',
            capabilities: ['coordination'],
            reportsTo: 'vp',
          },
          dev: {
            id: 'dev',
            name: 'Developer',
            agentType: 'claude-code',
            capabilities: ['coding'],
            reportsTo: 'manager',
          },
        },
        escalation: {
          defaultBehavior: 'route_to_reports_to',
          onMaxDepth: 'fail',
          maxDepth: 2,
        },
      };

      // Only dev has agents — all managers up the chain are empty
      const agents = [makeAgent('d1', 'dev')];
      const context = makeContext(agents, {
        dev: ['d1'],
        manager: [],
        vp: [],
        ceo: [],
      });

      const router = new MessageRouter(structure, context, logger, {
        maxEscalationDepth: 2,
      });

      const failSpy = vi.fn();
      router.on('question_failed', failSpy);

      await router.handleQuestion('d1', 'Deep question');

      expect(failSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Max escalation depth reached',
        })
      );
    });
  });

  describe('routing rules', () => {
    it('uses topic-based routing rules', async () => {
      const agents = [
        makeAgent('l1', 'lead'),
        makeAgent('w1', 'worker'),
      ];
      const context = makeContext(agents, {
        lead: ['l1'],
        worker: ['w1'],
      });
      const structure = makeStructure({
        routing: [
          {
            from: 'worker',
            to: 'lead',
            topics: ['architecture'],
          },
        ],
      });
      const router = new MessageRouter(structure, context, logger);

      const sendSpy = vi.fn();
      router.on('send_question', sendSpy);

      await router.handleQuestion(
        'w1',
        'Design question',
        'architecture'
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ toAgentId: 'l1' })
      );
    });
  });

  describe('options', () => {
    it('uses default timeout of 30s', () => {
      const context = makeContext([], {});
      const router = new MessageRouter(makeStructure(), context, logger);
      // Can't inspect private, but construction shouldn't throw
      expect(router).toBeDefined();
    });

    it('accepts custom options', () => {
      const context = makeContext([], {});
      const router = new MessageRouter(makeStructure(), context, logger, {
        defaultTimeout: 5000,
        maxEscalationDepth: 3,
      });
      expect(router).toBeDefined();
    });
  });
});
