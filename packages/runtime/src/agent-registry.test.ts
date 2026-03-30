import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRegistry } from './agent-registry';
import type { Agent, AgentResult } from './types';

function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    capabilities: ['analyze', 'code'],
    isAvailable: vi.fn().mockResolvedValue(true),
    analyze: vi.fn().mockResolvedValue({
      value: 'result',
      confidence: 0.9,
      agent: 'agent-1',
      timestamp: Date.now(),
    } satisfies AgentResult),
    ...overrides,
  };
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  describe('register', () => {
    it('should register an agent', () => {
      const agent = createMockAgent();
      registry.register(agent);
      expect(registry.getAgent('agent-1')).toBe(agent);
    });

    it('should throw on duplicate agent id', () => {
      const agent = createMockAgent();
      registry.register(agent);
      expect(() => registry.register(agent)).toThrow(
        'Agent with id agent-1 already registered'
      );
    });
  });

  describe('unregister', () => {
    it('should remove a registered agent', () => {
      const agent = createMockAgent();
      registry.register(agent);
      expect(registry.unregister('agent-1')).toBe(true);
      expect(registry.getAgent('agent-1')).toBeUndefined();
    });

    it('should return false for non-existent agent', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });
  });

  describe('getAllAgents', () => {
    it('should return all registered agents', () => {
      const a1 = createMockAgent({ id: 'a1', name: 'Agent 1' });
      const a2 = createMockAgent({ id: 'a2', name: 'Agent 2' });
      registry.register(a1);
      registry.register(a2);
      expect(registry.getAllAgents()).toHaveLength(2);
    });

    it('should return empty array when no agents', () => {
      expect(registry.getAllAgents()).toEqual([]);
    });
  });

  describe('getAvailableAgents', () => {
    it('should return only available agents', async () => {
      const available = createMockAgent({
        id: 'a1',
        isAvailable: vi.fn().mockResolvedValue(true),
      });
      const unavailable = createMockAgent({
        id: 'a2',
        isAvailable: vi.fn().mockResolvedValue(false),
      });
      registry.register(available);
      registry.register(unavailable);

      const result = await registry.getAvailableAgents();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('should return empty array when no agents available', async () => {
      const agent = createMockAgent({
        isAvailable: vi.fn().mockResolvedValue(false),
      });
      registry.register(agent);
      expect(await registry.getAvailableAgents()).toEqual([]);
    });
  });

  describe('getAgentsByCapability', () => {
    it('should filter agents by capability', () => {
      const coder = createMockAgent({
        id: 'a1',
        capabilities: ['code', 'review'],
      });
      const analyst = createMockAgent({
        id: 'a2',
        capabilities: ['analyze', 'review'],
      });
      registry.register(coder);
      registry.register(analyst);

      expect(registry.getAgentsByCapability('code')).toHaveLength(1);
      expect(registry.getAgentsByCapability('review')).toHaveLength(2);
      expect(registry.getAgentsByCapability('deploy')).toHaveLength(0);
    });
  });
});
