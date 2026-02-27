import { describe, it, expect } from 'vitest';
import { PatternComposer } from './composer';
import { OrchestrationRequirements } from '../types';

describe('PatternComposer', () => {
  let composer: PatternComposer;

  beforeEach(() => {
    composer = new PatternComposer();
  });

  describe('composePattern', () => {
    it('should compose a parallel + consensus pattern', async () => {
      const requirements: OrchestrationRequirements = {
        goal: 'Run parallel analysis and build consensus',
        strategy: 'multi-agent',
        minConfidence: 0.8,
      };

      const pattern = await composer.composePattern(requirements);
      expect(pattern.primitives).toContain('parallel');
      expect(pattern.primitives).toContain('consensus');
      expect(pattern.primitives).toContain('threshold');
      expect(pattern.estimatedConfidence).toBeGreaterThan(0);
      expect(pattern.complexity).toBeGreaterThan(0);
    });

    it('should compose a sequential pattern', async () => {
      const requirements: OrchestrationRequirements = {
        goal: 'Execute steps in sequential order',
      };

      const pattern = await composer.composePattern(requirements);
      expect(pattern.primitives).toContain('sequential');
      expect(pattern.primitives).not.toContain('parallel');
    });

    it('should add retry primitive for resilient requirements', async () => {
      const requirements: OrchestrationRequirements = {
        goal: 'Resilient parallel execution with retry',
      };

      const pattern = await composer.composePattern(requirements);
      expect(pattern.primitives).toContain('retry');
      expect(pattern.primitives).toContain('parallel');
    });

    it('should add fallback primitive', async () => {
      const requirements: OrchestrationRequirements = {
        goal: 'Analyze with fallback to backup agent',
      };

      const pattern = await composer.composePattern(requirements);
      expect(pattern.primitives).toContain('fallback');
    });

    it('should add escalation primitive', async () => {
      const requirements: OrchestrationRequirements = {
        goal: 'Process with supervisor escalation',
      };

      const pattern = await composer.composePattern(requirements);
      expect(pattern.primitives).toContain('escalate');
    });

    it('should generate connections between layers', async () => {
      const requirements: OrchestrationRequirements = {
        goal: 'Parallel consensus building',
        strategy: 'multi-agent',
      };

      const pattern = await composer.composePattern(requirements);
      expect(pattern.connections.length).toBeGreaterThan(0);
      expect(pattern.connections[0]).toHaveProperty('from');
      expect(pattern.connections[0]).toHaveProperty('to');
      expect(pattern.connections[0]).toHaveProperty('type', 'data-flow');
    });

    it('should include metadata from requirements', async () => {
      const requirements: OrchestrationRequirements = {
        goal: 'Simple parallel task',
        strategy: 'fast',
        minConfidence: 0.7,
      };

      const pattern = await composer.composePattern(requirements);
      expect(pattern.metadata.goal).toBe('Simple parallel task');
      expect(pattern.metadata.strategy).toBe('fast');
      expect(pattern.metadata.minConfidence).toBe(0.7);
      expect(pattern.metadata.generatedAt).toBeDefined();
    });

    it('should generate unique pattern ids', async () => {
      const req: OrchestrationRequirements = { goal: 'parallel test' };
      const p1 = await composer.composePattern(req);
      const p2 = await composer.composePattern(req);
      expect(p1.id).not.toBe(p2.id);
    });

    it('should generate description from primitive descriptions', async () => {
      const requirements: OrchestrationRequirements = {
        goal: 'Parallel voting analysis',
      };

      const pattern = await composer.composePattern(requirements);
      expect(pattern.description).toContain('Composed pattern:');
    });
  });

  describe('confidence estimation', () => {
    it('should estimate higher confidence with consensus', async () => {
      const withConsensus = await composer.composePattern({
        goal: 'Build consensus from parallel agents',
        strategy: 'multi-agent',
      });
      const withoutConsensus = await composer.composePattern({
        goal: 'Simple parallel execution',
      });

      // Consensus should boost estimated confidence
      expect(withConsensus.estimatedConfidence).toBeGreaterThanOrEqual(
        withoutConsensus.estimatedConfidence
      );
    });

    it('should keep confidence between 0.1 and 1.0', async () => {
      const pattern = await composer.composePattern({
        goal: 'Complex parallel consensus with retry fallback escalation',
        minConfidence: 0.9,
      });
      expect(pattern.estimatedConfidence).toBeGreaterThanOrEqual(0.1);
      expect(pattern.estimatedConfidence).toBeLessThanOrEqual(1.0);
    });
  });
});
