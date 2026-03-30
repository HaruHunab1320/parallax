import path from 'node:path';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EtcdRegistry } from '../../registry';
import { RuntimeManager } from '../../runtime-manager';
import { PatternEngine } from '../pattern-engine';
import { createMockAgents, type MockAgent } from './pattern-test-utils';

describe('Pattern Execution Tests', () => {
  let patternEngine: PatternEngine;
  let runtimeManager: RuntimeManager;
  let registry: EtcdRegistry;
  let mockAgents: MockAgent[];
  const logger = pino({ level: 'silent' });

  beforeEach(async () => {
    // Create real RuntimeManager with Prism runtime
    runtimeManager = new RuntimeManager(
      {
        maxInstances: 2,
        instanceTimeout: 30000,
        warmupInstances: 1,
        metricsEnabled: false,
      },
      logger
    );

    registry = {
      listServices: async () => [],
      registerService: async () => {},
      unregisterService: async () => {},
    } as any;

    // Create pattern engine
    const patternsDir = path.join(__dirname, '../../../../../patterns');
    patternEngine = new PatternEngine(
      runtimeManager,
      registry,
      patternsDir,
      logger
    );

    // Create mock agents
    mockAgents = createMockAgents(5);

    // Override agent selection to use mock agents (with addresses for agentProxy)
    mockAgents.forEach(
      (a, i) => ((a as any).endpoint = `mock-agent-${i}:50051`)
    );
    (patternEngine as any).selectAgents = async () => mockAgents;

    // Mock agentProxy to bridge to mock agents instead of real gRPC
    const agentMap = new Map(mockAgents.map((a) => [(a as any).endpoint, a]));
    (patternEngine as any).agentProxy = {
      healthCheck: async () => true,
      executeTask: async (address: string, task: any) => {
        const agent = agentMap.get(address);
        if (!agent) return { value: null, confidence: 0 };
        return agent.analyze(task.description, task.data);
      },
    };

    await patternEngine.initialize();
  });

  describe('Consensus Builder Pattern', () => {
    it('should build consensus from multiple agents', async () => {
      // Configure agent responses
      mockAgents[0].setDefaultResponse({ answer: 'A' }, 0.9);
      mockAgents[1].setDefaultResponse({ answer: 'A' }, 0.85);
      mockAgents[2].setDefaultResponse({ answer: 'B' }, 0.7);
      mockAgents[3].setDefaultResponse({ answer: 'A' }, 0.95);
      mockAgents[4].setDefaultResponse({ answer: 'C' }, 0.6);

      const result = await patternEngine.executePattern('ConsensusBuilder', {
        task: 'Test consensus',
        data: { test: true },
      });

      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();
      // result.result.confidence is the overall Prism confidence (number)
      expect(result.result.confidence).toBeGreaterThan(0.7);
      // result.result.value contains the Prism output object
      const value = result.result.value;
      expect(value.type).toMatch(/consensus/);
      expect(value.agentCount).toBe(5);
      expect(value.successfulAgents).toBe(5);
      expect(value.highConfidenceAgents).toBeGreaterThanOrEqual(3);
    });

    it('should handle low consensus scenarios', async () => {
      // Configure diverse responses
      mockAgents.forEach((agent, i) => {
        agent.setDefaultResponse({ answer: `Answer${i}` }, 0.5 + i * 0.1);
      });

      const result = await patternEngine.executePattern('ConsensusBuilder', {
        task: 'Test low consensus',
        data: {},
      });

      expect(result.status).toBe('completed');
      const value = result.result.value;
      // With diverse answers, consensus should be weak or moderate
      expect(['weak_consensus', 'moderate_consensus']).toContain(value.type);
      expect(value.agentCount).toBe(5);
    });
  });

  describe('Confidence Cascade Pattern', () => {
    it('should cascade until reaching target confidence', async () => {
      // Set increasing confidence for each agent
      mockAgents[0].setDefaultResponse({ step: 1 }, 0.5);
      mockAgents[1].setDefaultResponse({ step: 2 }, 0.7);
      mockAgents[2].setDefaultResponse({ step: 3 }, 0.9);

      const result = await patternEngine.executePattern('ConfidenceCascade', {
        task: 'Test cascade',
        data: {},
        minConfidence: 0.85,
      });

      expect(result.status).toBe('completed');
      const value = result.result.value;
      // The cascade should have processed agents
      expect(value.attempts).toBeGreaterThanOrEqual(1);
      expect(value.confidence).toBeGreaterThan(0);
    });

    it('should stop early if confidence is reached', async () => {
      mockAgents[0].setDefaultResponse({ high: true }, 0.95);

      const result = await patternEngine.executePattern('ConfidenceCascade', {
        task: 'Test early stop',
        data: {},
        minConfidence: 0.8,
      });

      expect(result.status).toBe('completed');
      const value = result.result.value;
      // First agent had 0.95 confidence, should achieve target
      expect(value.status).toBe('target_achieved');
      expect(value.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Uncertainty Router Pattern', () => {
    it('should route based on uncertainty levels', async () => {
      mockAgents[0].setDefaultResponse({ assessment: 'complex' }, 0.3);

      const result = await patternEngine.executePattern('UncertaintyRouter', {
        task: 'Test routing',
        context: { complexity: 'unknown' },
      });

      expect(result.status).toBe('completed');
      const value = result.result.value;
      // Low confidence (0.3) should trigger specialist routing
      expect(value.routingStrategy).toBe('specialist_required');
    });

    it('should proceed with high confidence', async () => {
      mockAgents[0].setDefaultResponse({ assessment: 'simple' }, 0.95);

      const result = await patternEngine.executePattern('UncertaintyRouter', {
        task: 'Test simple task',
        context: {},
      });

      expect(result.status).toBe('completed');
      const value = result.result.value;
      // High confidence (0.95) should use generalist
      expect(value.routingStrategy).toBe('generalist_sufficient');
      expect(value.assessmentConfidence).toBeGreaterThan(0.8);
    });
  });

  describe('Pattern Error Handling', () => {
    it('should handle pattern not found', async () => {
      await expect(
        patternEngine.executePattern('non-existent-pattern', {})
      ).rejects.toThrow('Pattern non-existent-pattern not found');
    });

    it('should handle insufficient agents gracefully', async () => {
      // Override to return no agents
      (patternEngine as any).selectAgents = async () => [];

      const result = await patternEngine.executePattern('ConsensusBuilder', {});

      // With 0 agents, the pattern still executes but produces weak results
      expect(result.status).toBe('completed');
      const value = result.result.value;
      expect(value.agentCount).toBe(0);
      expect(value.type).toBe('weak_consensus');
    });
  });
});

describe('Pattern Composition Tests', () => {
  // Test that patterns can compose other patterns
  it('should execute robust-analysis pattern with composition', async () => {
    // This would test the robust-analysis pattern which uses other patterns
    // Implementation depends on full pattern engine setup
  });
});
