import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRepository } from '@/db/repositories/agent.repository';
import { getTestPrisma, createTestAgent } from '../../../setup';
import pino from 'pino';

describe('AgentRepository', () => {
  let repository: AgentRepository;
  let logger: pino.Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' });
    const prisma = getTestPrisma();
    repository = new AgentRepository(prisma, logger);
  });

  describe('create', () => {
    it('should create a new agent', async () => {
      const agent = await repository.create({
        name: 'test-create-agent',
        endpoint: 'http://localhost:8080',
        capabilities: ['test', 'analyze'],
        status: 'active',
        metadata: { version: '1.0.0' }
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('test-create-agent');
      expect(agent.endpoint).toBe('http://localhost:8080');
      expect(agent.capabilities).toEqual(['test', 'analyze']);
      expect(agent.status).toBe('active');
    });
  });

  describe('findById', () => {
    it('should find agent by id', async () => {
      const created = await createTestAgent({ name: 'find-by-id' });
      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('find-by-id');
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should find agent by name', async () => {
      await createTestAgent({ name: 'unique-agent-name' });
      const found = await repository.findByName('unique-agent-name');

      expect(found).toBeDefined();
      expect(found?.name).toBe('unique-agent-name');
    });

    it('should return null for non-existent name', async () => {
      const found = await repository.findByName('non-existent-agent');
      expect(found).toBeNull();
    });

    it('should return first match if multiple agents have same name', async () => {
      const agent1 = await createTestAgent({ name: 'duplicate-name', endpoint: 'http://agent1' });
      const agent2 = await createTestAgent({ name: 'duplicate-name', endpoint: 'http://agent2' });

      const found = await repository.findByName('duplicate-name');
      expect(found).toBeDefined();
      // Should return one of them (implementation dependent)
      expect([agent1.id, agent2.id]).toContain(found?.id);
    });
  });

  describe('findAll', () => {
    it('should return all agents', async () => {
      await createTestAgent({ name: 'agent-1' });
      await createTestAgent({ name: 'agent-2' });
      await createTestAgent({ name: 'agent-3' });

      const agents = await repository.findAll();
      expect(agents).toHaveLength(3);
    });

    it('should filter by status', async () => {
      await createTestAgent({ name: 'active-1', status: 'active' });
      await createTestAgent({ name: 'active-2', status: 'active' });
      await createTestAgent({ name: 'inactive-1', status: 'inactive' });

      const activeAgents = await repository.findAll({
        where: { status: 'active' }
      });
      
      expect(activeAgents).toHaveLength(2);
      expect(activeAgents.every(a => a.status === 'active')).toBe(true);
    });
  });

  describe('findActive', () => {
    it('should return only active agents with recent heartbeat', async () => {
      const now = new Date();
      const recentTime = new Date(now.getTime() - 30000); // 30 seconds ago
      const oldTime = new Date(now.getTime() - 120000); // 2 minutes ago

      await createTestAgent({ 
        name: 'active-recent',
        status: 'active',
        lastSeen: recentTime
      });

      await createTestAgent({ 
        name: 'active-old',
        status: 'active',
        lastSeen: oldTime
      });

      await createTestAgent({ 
        name: 'inactive-recent',
        status: 'inactive',
        lastSeen: recentTime
      });

      const activeAgents = await repository.findActive();
      
      expect(activeAgents).toHaveLength(1);
      expect(activeAgents[0].name).toBe('active-recent');
    });
  });

  describe('updateHeartbeat', () => {
    it('should update agent lastSeen and status', async () => {
      const agent = await createTestAgent({ 
        name: 'heartbeat-test',
        status: 'inactive',
        lastSeen: new Date('2020-01-01')
      });

      const beforeUpdate = new Date();
      const updated = await repository.updateHeartbeat(agent.id);

      expect(updated.status).toBe('active');
      expect(updated.lastSeen.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });
  });

  describe('markInactive', () => {
    it('should mark old agents as inactive', async () => {
      const now = new Date();
      const oldTime = new Date(now.getTime() - 120000); // 2 minutes ago
      const recentTime = new Date(now.getTime() - 30000); // 30 seconds ago
      const threshold = new Date(now.getTime() - 60000); // 1 minute ago

      await createTestAgent({ 
        name: 'old-active',
        status: 'active',
        lastSeen: oldTime
      });

      await createTestAgent({ 
        name: 'recent-active',
        status: 'active',
        lastSeen: recentTime
      });

      await createTestAgent({ 
        name: 'already-inactive',
        status: 'inactive',
        lastSeen: oldTime
      });

      const count = await repository.markInactive(threshold);
      
      expect(count).toBe(1); // Only 'old-active' should be marked

      const oldAgent = await repository.findByName('old-active');
      expect(oldAgent?.status).toBe('inactive');

      const recentAgent = await repository.findByName('recent-active');
      expect(recentAgent?.status).toBe('active');
    });
  });

  describe('getCapabilitiesStats', () => {
    it('should return capability statistics', async () => {
      await createTestAgent({ 
        name: 'agent-1',
        status: 'active',
        capabilities: ['analyze', 'process']
      });

      await createTestAgent({ 
        name: 'agent-2',
        status: 'active',
        capabilities: ['analyze', 'transform']
      });

      await createTestAgent({ 
        name: 'agent-3',
        status: 'inactive',
        capabilities: ['analyze', 'process', 'transform']
      });

      const stats = await repository.getCapabilitiesStats();
      
      const analyzeStats = stats.find((s: any) => s.capability === 'analyze');
      expect(analyzeStats).toBeDefined();
      expect(analyzeStats.agent_count).toBe('3');
      expect(analyzeStats.active_count).toBe('2');

      const processStats = stats.find((s: any) => s.capability === 'process');
      expect(processStats).toBeDefined();
      expect(processStats.agent_count).toBe('2');
      expect(processStats.active_count).toBe('1');
    });
  });
});