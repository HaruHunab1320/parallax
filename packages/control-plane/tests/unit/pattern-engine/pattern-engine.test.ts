import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternEngine } from '@/pattern-engine/pattern-engine';
import { RuntimeManager } from '@/runtime-manager';
import { EtcdRegistry } from '@/registry';
import { DatabaseService } from '@/db/database.service';
import pino from 'pino';
import path from 'path';

// Mock dependencies
vi.mock('@/runtime-manager');
vi.mock('@/registry');
vi.mock('@/db/database.service');

describe('PatternEngine', () => {
  let engine: PatternEngine;
  let runtimeManager: RuntimeManager;
  let registry: EtcdRegistry;
  let database: DatabaseService;
  let logger: pino.Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' });
    runtimeManager = new RuntimeManager({} as any, logger);
    registry = new EtcdRegistry(['localhost:2379'], 'test', logger);
    database = new DatabaseService(logger);
    
    const patternsDir = path.join(__dirname, '../../../patterns');
    engine = new PatternEngine(
      runtimeManager,
      registry,
      patternsDir,
      logger,
      database
    );
  });

  describe('initialize', () => {
    it('should load patterns on initialization', async () => {
      await engine.initialize();
      
      const patterns = engine.listPatterns();
      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('getPattern', () => {
    it('should return pattern by name', async () => {
      await engine.initialize();
      
      // Assuming we have test patterns in the patterns directory
      const patterns = engine.listPatterns();
      if (patterns.length > 0) {
        const firstPattern = patterns[0];
        const retrieved = engine.getPattern(firstPattern.name);
        
        expect(retrieved).toBeDefined();
        expect(retrieved?.name).toBe(firstPattern.name);
      }
    });

    it('should return null for non-existent pattern', async () => {
      await engine.initialize();
      
      const pattern = engine.getPattern('non-existent-pattern');
      expect(pattern).toBeNull();
    });
  });

  describe('listPatterns', () => {
    it('should return all loaded patterns', async () => {
      await engine.initialize();
      
      const patterns = engine.listPatterns();
      expect(Array.isArray(patterns)).toBe(true);
      
      // Each pattern should have required properties
      patterns.forEach(pattern => {
        expect(pattern).toHaveProperty('name');
        expect(pattern).toHaveProperty('version');
        expect(pattern).toHaveProperty('description');
        expect(pattern).toHaveProperty('script');
      });
    });
  });

  describe('executePattern', () => {
    it('should execute a pattern and return execution result', async () => {
      await engine.initialize();
      
      // Mock registry to return test agents
      vi.spyOn(registry, 'listServices').mockResolvedValue([
        {
          id: 'test-agent-1',
          name: 'test-agent-1',
          endpoint: 'http://localhost:8080',
          metadata: {
            capabilities: ['analyze', 'test']
          }
        }
      ]);

      // Create a simple test pattern
      const testPattern = {
        name: 'test-pattern',
        version: '1.0.0',
        description: 'Test pattern',
        script: 'pattern test { return "success"; }',
        input: { type: 'any' },
        minAgents: 1
      };

      // Mock the pattern loader to include our test pattern
      const getPatternSpy = vi.spyOn(engine, 'getPattern').mockReturnValue(testPattern);

      const result = await engine.executePattern('test-pattern', { test: 'data' });
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.patternName).toBe('test-pattern');
      expect(result.status).toBe('completed');
      expect(result.startTime).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent pattern', async () => {
      await engine.initialize();
      
      await expect(
        engine.executePattern('non-existent', { test: 'data' })
      ).rejects.toThrow('Pattern non-existent not found');
    });

    it('should handle pattern execution failure', async () => {
      await engine.initialize();
      
      // Mock a pattern that will fail
      const failingPattern = {
        name: 'failing-pattern',
        version: '1.0.0',
        description: 'Failing pattern',
        script: 'pattern failing { throw "Intentional failure"; }',
        input: { type: 'any' },
        minAgents: 1
      };

      vi.spyOn(engine, 'getPattern').mockReturnValue(failingPattern);
      vi.spyOn(registry, 'listServices').mockResolvedValue([]);

      await expect(
        engine.executePattern('failing-pattern', { test: 'data' })
      ).rejects.toThrow();
    });
  });

  describe('getExecution', () => {
    it('should return execution by id', async () => {
      await engine.initialize();
      
      // Create a mock execution
      const mockExecution = {
        id: 'test-execution-id',
        patternName: 'test-pattern',
        startTime: new Date(),
        status: 'completed' as const,
        result: { success: true }
      };

      // Add execution to internal map
      (engine as any).executions.set(mockExecution.id, mockExecution);

      const retrieved = engine.getExecution(mockExecution.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(mockExecution.id);
      expect(retrieved?.patternName).toBe('test-pattern');
    });

    it('should return undefined for non-existent execution', () => {
      const execution = engine.getExecution('non-existent-id');
      expect(execution).toBeUndefined();
    });
  });

  describe('getMetrics', () => {
    it('should return execution metrics', async () => {
      await engine.initialize();
      
      // Add some mock executions
      const executions = [
        {
          id: 'exec-1',
          patternName: 'pattern-1',
          startTime: new Date(),
          endTime: new Date(Date.now() + 1000),
          status: 'completed' as const,
          metrics: { confidence: 0.9, agentCount: 2 }
        },
        {
          id: 'exec-2',
          patternName: 'pattern-2',
          startTime: new Date(),
          endTime: new Date(Date.now() + 2000),
          status: 'failed' as const,
          metrics: { confidence: 0.5, agentCount: 1 }
        }
      ];

      executions.forEach(exec => {
        (engine as any).executions.set(exec.id, exec);
      });

      const metrics = engine.getMetrics();
      
      expect(metrics).toHaveLength(2);
      expect(metrics[0]).toHaveProperty('pattern');
      expect(metrics[0]).toHaveProperty('timestamp');
      expect(metrics[0]).toHaveProperty('duration');
      expect(metrics[0]).toHaveProperty('confidence');
      expect(metrics[0]).toHaveProperty('success');
    });

    it('should return empty array when no executions', () => {
      const metrics = engine.getMetrics();
      expect(metrics).toEqual([]);
    });
  });

  describe('registerLocalAgents', () => {
    it('should register local agent instances', () => {
      const mockAgents = [
        { id: 'agent-1', name: 'Test Agent 1' },
        { id: 'agent-2', name: 'Test Agent 2' }
      ];

      engine.registerLocalAgents(mockAgents);
      
      // Verify agents are stored
      expect((engine as any).localAgents).toEqual(mockAgents);
    });
  });

  describe('getCalibrationService', () => {
    it('should return calibration service instance', () => {
      const calibrationService = engine.getCalibrationService();
      
      expect(calibrationService).toBeDefined();
      expect(calibrationService.constructor.name).toBe('ConfidenceCalibrationService');
    });
  });
});