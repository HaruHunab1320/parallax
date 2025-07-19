import { describe, it, expect, beforeEach } from 'vitest';
import { PatternRepository } from '@/db/repositories/pattern.repository';
import { getTestPrisma, createTestPattern } from '../../../setup';
import pino from 'pino';

describe('PatternRepository', () => {
  let repository: PatternRepository;
  let logger: pino.Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' }); // Silent logger for tests
    const prisma = getTestPrisma();
    repository = new PatternRepository(prisma, logger);
  });

  describe('create', () => {
    it('should create a new pattern', async () => {
      const pattern = await repository.create({
        name: 'test-create-pattern',
        version: '1.0.0',
        description: 'Test pattern creation',
        script: 'pattern test { }'
      });

      expect(pattern).toBeDefined();
      expect(pattern.id).toBeDefined();
      expect(pattern.name).toBe('test-create-pattern');
      expect(pattern.version).toBe('1.0.0');
      expect(pattern.description).toBe('Test pattern creation');
    });

    it('should throw error for duplicate pattern name', async () => {
      await repository.create({
        name: 'duplicate-pattern',
        version: '1.0.0',
        description: 'First pattern',
        script: 'pattern test { }'
      });

      await expect(
        repository.create({
          name: 'duplicate-pattern',
          version: '2.0.0',
          description: 'Second pattern',
          script: 'pattern test2 { }'
        })
      ).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should find pattern by id', async () => {
      const created = await createTestPattern({ name: 'find-by-id' });
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
    it('should find pattern by name', async () => {
      await createTestPattern({ name: 'find-by-name' });
      const found = await repository.findByName('find-by-name');

      expect(found).toBeDefined();
      expect(found?.name).toBe('find-by-name');
    });

    it('should return null for non-existent name', async () => {
      const found = await repository.findByName('non-existent-pattern');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all patterns', async () => {
      await createTestPattern({ name: 'pattern-1' });
      await createTestPattern({ name: 'pattern-2' });
      await createTestPattern({ name: 'pattern-3' });

      const patterns = await repository.findAll();
      expect(patterns).toHaveLength(3);
      expect(patterns.map(p => p.name)).toContain('pattern-1');
      expect(patterns.map(p => p.name)).toContain('pattern-2');
      expect(patterns.map(p => p.name)).toContain('pattern-3');
    });

    it('should support pagination', async () => {
      for (let i = 1; i <= 5; i++) {
        await createTestPattern({ name: `pattern-${i}` });
      }

      const page1 = await repository.findAll({ take: 2, skip: 0 });
      expect(page1).toHaveLength(2);

      const page2 = await repository.findAll({ take: 2, skip: 2 });
      expect(page2).toHaveLength(2);

      const page3 = await repository.findAll({ take: 2, skip: 4 });
      expect(page3).toHaveLength(1);
    });

    it('should support ordering', async () => {
      await createTestPattern({ name: 'z-pattern' });
      await createTestPattern({ name: 'a-pattern' });
      await createTestPattern({ name: 'm-pattern' });

      const patterns = await repository.findAll({
        orderBy: { name: 'asc' }
      });

      expect(patterns[0].name).toBe('a-pattern');
      expect(patterns[1].name).toBe('m-pattern');
      expect(patterns[2].name).toBe('z-pattern');
    });
  });

  describe('update', () => {
    it('should update pattern', async () => {
      const pattern = await createTestPattern({ 
        name: 'update-test',
        description: 'Original description'
      });

      const updated = await repository.update(pattern.id, {
        description: 'Updated description',
        metadata: { updated: true }
      });

      expect(updated.description).toBe('Updated description');
      expect(updated.metadata).toEqual({ updated: true });
      expect(updated.name).toBe('update-test'); // Unchanged
    });

    it('should throw error for non-existent pattern', async () => {
      await expect(
        repository.update('non-existent-id', { description: 'Update' })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete pattern', async () => {
      const pattern = await createTestPattern({ name: 'delete-test' });
      
      const deleted = await repository.delete(pattern.id);
      expect(deleted.id).toBe(pattern.id);

      const found = await repository.findById(pattern.id);
      expect(found).toBeNull();
    });

    it('should throw error for non-existent pattern', async () => {
      await expect(
        repository.delete('non-existent-id')
      ).rejects.toThrow();
    });
  });

  describe('count', () => {
    it('should count all patterns', async () => {
      await createTestPattern({ name: 'count-1' });
      await createTestPattern({ name: 'count-2' });
      await createTestPattern({ name: 'count-3' });

      const count = await repository.count();
      expect(count).toBe(3);
    });

    it('should count with filter', async () => {
      await createTestPattern({ name: 'test-pattern-1' });
      await createTestPattern({ name: 'test-pattern-2' });
      await createTestPattern({ name: 'other-pattern' });

      const count = await repository.count({
        name: { startsWith: 'test-' }
      });
      expect(count).toBe(2);
    });
  });

  describe('getPerformanceStats', () => {
    it('should return performance statistics', async () => {
      const pattern = await createTestPattern({ name: 'perf-test' });
      const prisma = getTestPrisma();

      // Create some executions
      await prisma.execution.create({
        data: {
          patternId: pattern.id,
          input: {},
          status: 'completed',
          durationMs: 1000,
          confidence: 0.9
        }
      });

      await prisma.execution.create({
        data: {
          patternId: pattern.id,
          input: {},
          status: 'failed',
          durationMs: 500,
          confidence: 0.5
        }
      });

      const stats = await repository.getPerformanceStats(pattern.id);
      
      expect(stats.total_executions).toBe('2');
      expect(stats.successful_executions).toBe('1');
      expect(stats.failed_executions).toBe('1');
      expect(parseFloat(stats.avg_duration_ms)).toBe(750);
      expect(parseFloat(stats.avg_confidence)).toBe(0.7);
    });

    it('should return empty stats for pattern with no executions', async () => {
      const pattern = await createTestPattern({ name: 'no-executions' });
      const stats = await repository.getPerformanceStats(pattern.id);

      expect(stats.total_executions).toBe(0);
      expect(stats.avg_duration_ms).toBeNull();
      expect(stats.successful_executions).toBe(0);
      expect(stats.failed_executions).toBe(0);
      expect(stats.avg_confidence).toBeNull();
    });
  });
});