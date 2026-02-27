import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParallaxCoordinator } from './coordinator';
import { Agent, AgentResult, CoordinationPattern } from './types';

function createMockAgent(id: string, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    name: `Agent ${id}`,
    capabilities: ['analyze'],
    isAvailable: vi.fn().mockResolvedValue(true),
    analyze: vi.fn().mockResolvedValue({
      value: `result-${id}`,
      confidence: 0.9,
      agent: id,
      timestamp: Date.now(),
    } satisfies AgentResult),
    ...overrides,
  };
}

function createMockPattern(overrides: Partial<CoordinationPattern> = {}): CoordinationPattern {
  return {
    name: 'test-pattern',
    description: 'Test pattern',
    execute: vi.fn().mockResolvedValue('pattern-result'),
    ...overrides,
  };
}

describe('ParallaxCoordinator', () => {
  let coordinator: ParallaxCoordinator;

  beforeEach(() => {
    coordinator = new ParallaxCoordinator();
  });

  describe('registerAgent', () => {
    it('should register an agent in the registry', () => {
      const agent = createMockAgent('a1');
      coordinator.registerAgent(agent);
      expect(coordinator.getRegistry().getAgent('a1')).toBe(agent);
    });
  });

  describe('registerPattern', () => {
    it('should register a coordination pattern', () => {
      const pattern = createMockPattern();
      coordinator.registerPattern(pattern);
      // Pattern is stored internally, verified through coordinate()
    });
  });

  describe('coordinate', () => {
    it('should execute a registered pattern with available agents', async () => {
      const agent = createMockAgent('a1');
      const pattern = createMockPattern();
      coordinator.registerAgent(agent);
      coordinator.registerPattern(pattern);

      const result = await coordinator.coordinate('test-pattern', 'analyze code');
      expect(result).toBe('pattern-result');
      expect(pattern.execute).toHaveBeenCalledWith([agent], 'analyze code', undefined);
    });

    it('should throw for unknown pattern', async () => {
      const agent = createMockAgent('a1');
      coordinator.registerAgent(agent);
      await expect(coordinator.coordinate('unknown', 'task')).rejects.toThrow('Pattern unknown not found');
    });

    it('should throw when no agents available', async () => {
      const agent = createMockAgent('a1', { isAvailable: vi.fn().mockResolvedValue(false) });
      const pattern = createMockPattern();
      coordinator.registerAgent(agent);
      coordinator.registerPattern(pattern);
      await expect(coordinator.coordinate('test-pattern', 'task')).rejects.toThrow('No available agents');
    });
  });

  describe('analyzeWithAllAgents', () => {
    it('should call analyze on all available agents', async () => {
      const a1 = createMockAgent('a1');
      const a2 = createMockAgent('a2');
      coordinator.registerAgent(a1);
      coordinator.registerAgent(a2);

      const results = await coordinator.analyzeWithAllAgents('test task');
      expect(results).toHaveLength(2);
      expect(a1.analyze).toHaveBeenCalledWith('test task', undefined);
      expect(a2.analyze).toHaveBeenCalledWith('test task', undefined);
    });

    it('should pass data to agents', async () => {
      const agent = createMockAgent('a1');
      coordinator.registerAgent(agent);

      await coordinator.analyzeWithAllAgents('task', { key: 'value' });
      expect(agent.analyze).toHaveBeenCalledWith('task', { key: 'value' });
    });
  });

  describe('getConsensus', () => {
    it('should delegate to ConfidenceProtocol', async () => {
      const results: AgentResult[] = [
        { value: 'yes', confidence: 0.9, agent: 'a1', timestamp: Date.now() },
        { value: 'yes', confidence: 0.8, agent: 'a2', timestamp: Date.now() },
      ];
      const consensus = await coordinator.getConsensus(results);
      expect(consensus.consensus).toBeCloseTo(0.85);
      expect(consensus.disagreements).toEqual([]);
    });
  });

  describe('shouldExploreParallel', () => {
    it('should delegate to ConfidenceProtocol', () => {
      const results: AgentResult[] = [
        { value: 'yes', confidence: 0.9, agent: 'a1', timestamp: Date.now() },
        { value: 'yes', confidence: 0.8, agent: 'a2', timestamp: Date.now() },
      ];
      // High consensus → should not explore parallel
      expect(coordinator.shouldExploreParallel(results)).toBe(false);
    });
  });

  describe('getRegistry / getProtocol', () => {
    it('should expose registry and protocol', () => {
      expect(coordinator.getRegistry()).toBeDefined();
      expect(coordinator.getProtocol()).toBeDefined();
    });
  });
});
