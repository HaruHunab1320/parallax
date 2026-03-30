import { describe, expect, it } from 'vitest';
import { ConfidenceProtocol, DEFAULT_THRESHOLDS } from './confidence-protocol';
import type { AgentResult } from './types';

function makeResult<T>(
  value: T,
  confidence: number,
  agent: string
): AgentResult<T> {
  return { value, confidence, agent, timestamp: Date.now() };
}

describe('ConfidenceProtocol', () => {
  describe('DEFAULT_THRESHOLDS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_THRESHOLDS).toEqual({ high: 0.8, medium: 0.5, low: 0.0 });
    });
  });

  describe('getConfidenceLevel', () => {
    const protocol = new ConfidenceProtocol();

    it('should return high for confidence >= 0.8', () => {
      expect(protocol.getConfidenceLevel(0.8)).toBe('high');
      expect(protocol.getConfidenceLevel(0.95)).toBe('high');
      expect(protocol.getConfidenceLevel(1.0)).toBe('high');
    });

    it('should return medium for confidence >= 0.5 and < 0.8', () => {
      expect(protocol.getConfidenceLevel(0.5)).toBe('medium');
      expect(protocol.getConfidenceLevel(0.7)).toBe('medium');
    });

    it('should return low for confidence < 0.5', () => {
      expect(protocol.getConfidenceLevel(0.0)).toBe('low');
      expect(protocol.getConfidenceLevel(0.49)).toBe('low');
    });

    it('should respect custom thresholds', () => {
      const custom = new ConfidenceProtocol({
        high: 0.9,
        medium: 0.6,
        low: 0.0,
      });
      expect(custom.getConfidenceLevel(0.85)).toBe('medium');
      expect(custom.getConfidenceLevel(0.9)).toBe('high');
    });
  });

  describe('calculateWeightedConsensus', () => {
    const protocol = new ConfidenceProtocol();

    it('should return 0 consensus for empty results', () => {
      const { consensus, disagreements } = protocol.calculateWeightedConsensus(
        []
      );
      expect(consensus).toBe(0);
      expect(disagreements).toEqual([]);
    });

    it('should calculate average confidence', () => {
      const results = [
        makeResult('yes', 0.9, 'a1'),
        makeResult('yes', 0.7, 'a2'),
      ];
      const { consensus } = protocol.calculateWeightedConsensus(results);
      expect(consensus).toBe(0.8);
    });

    it('should detect disagreements between high-confidence agents', () => {
      const results = [
        makeResult('yes', 0.9, 'a1'),
        makeResult('no', 0.85, 'a2'),
      ];
      const { disagreements } = protocol.calculateWeightedConsensus(results);
      expect(disagreements).toHaveLength(1);
      expect(disagreements[0].agent1).toBe('a1');
      expect(disagreements[0].agent2).toBe('a2');
    });

    it('should not flag disagreements when values agree', () => {
      const results = [
        makeResult('yes', 0.9, 'a1'),
        makeResult('yes', 0.85, 'a2'),
      ];
      const { disagreements } = protocol.calculateWeightedConsensus(results);
      expect(disagreements).toHaveLength(0);
    });

    it('should not flag disagreements for low-confidence agents', () => {
      const results = [
        makeResult('yes', 0.4, 'a1'),
        makeResult('no', 0.3, 'a2'),
      ];
      const { disagreements } = protocol.calculateWeightedConsensus(results);
      expect(disagreements).toHaveLength(0);
    });
  });

  describe('shouldExploreParallel', () => {
    const protocol = new ConfidenceProtocol();

    it('should return true when low consensus + high confidence + disagreements', () => {
      const _results = [
        makeResult('yes', 0.9, 'a1'),
        makeResult('no', 0.85, 'a2'),
        makeResult('maybe', 0.1, 'a3'),
      ];
      // Average confidence < 0.5 threshold won't hold here since (0.9+0.85+0.1)/3 = 0.617
      // We need consensus < medium (0.5)
      const lowResults = [
        makeResult('yes', 0.9, 'a1'),
        makeResult('no', 0.85, 'a2'),
        makeResult('x', 0.05, 'a3'),
        makeResult('y', 0.05, 'a4'),
        makeResult('z', 0.05, 'a5'),
      ];
      expect(protocol.shouldExploreParallel(lowResults)).toBe(true);
    });

    it('should return false when consensus is high', () => {
      const results = [
        makeResult('yes', 0.9, 'a1'),
        makeResult('yes', 0.8, 'a2'),
      ];
      expect(protocol.shouldExploreParallel(results)).toBe(false);
    });

    it('should return false with no high confidence results', () => {
      const results = [
        makeResult('yes', 0.3, 'a1'),
        makeResult('no', 0.2, 'a2'),
      ];
      expect(protocol.shouldExploreParallel(results)).toBe(false);
    });
  });
});
