import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryConfidenceStore } from './confidence-store';
import type { ConfidenceDataPoint } from './types';

function makeDataPoint(
  agentId: string,
  confidence: number,
  timestamp?: Date,
  overrides: Partial<ConfidenceDataPoint> = {}
): ConfidenceDataPoint {
  return {
    agentId,
    pattern: 'test-pattern',
    task: 'analyze',
    confidence,
    timestamp: timestamp || new Date(),
    ...overrides,
  };
}

const defaultConfig = {
  maxDataPoints: 1000,
  retentionPeriodDays: 7,
  aggregationIntervals: { minute: 60, hour: 3600, day: 86400 },
};

describe('InMemoryConfidenceStore', () => {
  let store: InMemoryConfidenceStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryConfidenceStore(defaultConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('addDataPoint', () => {
    it('should add a data point and emit event', async () => {
      const handler = vi.fn();
      store.on('confidence:recorded', handler);

      const dp = makeDataPoint('a1', 0.9);
      await store.addDataPoint(dp);

      expect(handler).toHaveBeenCalledWith(dp);
    });
  });

  describe('getDataPoints', () => {
    it('should filter by agent and time range', async () => {
      const now = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(now);

      await store.addDataPoint(
        makeDataPoint('a1', 0.9, new Date('2025-01-15T11:00:00Z'))
      );
      await store.addDataPoint(
        makeDataPoint('a1', 0.8, new Date('2025-01-15T11:30:00Z'))
      );
      await store.addDataPoint(
        makeDataPoint('a2', 0.7, new Date('2025-01-15T11:00:00Z'))
      );

      const result = await store.getDataPoints(
        'a1',
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T12:00:00Z')
      );
      expect(result).toHaveLength(2);
      expect(result.every((dp) => dp.agentId === 'a1')).toBe(true);
    });

    it('should return empty for unknown agent', async () => {
      const result = await store.getDataPoints(
        'unknown',
        new Date(0),
        new Date()
      );
      expect(result).toEqual([]);
    });
  });

  describe('query', () => {
    it('should filter by multiple criteria', async () => {
      const now = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(now);

      await store.addDataPoint(
        makeDataPoint('a1', 0.9, new Date('2025-01-15T11:00:00Z'))
      );
      await store.addDataPoint(
        makeDataPoint('a1', 0.4, new Date('2025-01-15T11:30:00Z'))
      );
      await store.addDataPoint(
        makeDataPoint('a2', 0.7, new Date('2025-01-15T11:00:00Z'))
      );

      const result = await store.query({
        agentIds: ['a1'],
        minConfidence: 0.5,
      });
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(0.9);
    });

    it('should sort by timestamp descending', async () => {
      const now = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(now);

      await store.addDataPoint(
        makeDataPoint('a1', 0.9, new Date('2025-01-15T10:00:00Z'))
      );
      await store.addDataPoint(
        makeDataPoint('a1', 0.8, new Date('2025-01-15T11:00:00Z'))
      );
      await store.addDataPoint(
        makeDataPoint('a1', 0.7, new Date('2025-01-15T09:00:00Z'))
      );

      const result = await store.query({ agentIds: ['a1'] });
      expect(result[0].confidence).toBe(0.8); // Most recent first
      expect(result[2].confidence).toBe(0.7); // Oldest last
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 10; i++) {
        await store.addDataPoint(makeDataPoint('a1', 0.5 + i * 0.01));
      }
      const result = await store.query({ agentIds: ['a1'], limit: 3 });
      expect(result).toHaveLength(3);
    });
  });

  describe('getPatternStats', () => {
    it('should calculate pattern statistics', async () => {
      const now = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(now);

      await store.addDataPoint(
        makeDataPoint('a1', 0.9, now, { pattern: 'consensus' })
      );
      await store.addDataPoint(
        makeDataPoint('a2', 0.8, now, { pattern: 'consensus' })
      );
      await store.addDataPoint(
        makeDataPoint('a1', 0.3, now, { pattern: 'consensus' })
      );

      const stats = await store.getPatternStats(
        'consensus',
        new Date('2025-01-15T00:00:00Z'),
        new Date('2025-01-16T00:00:00Z')
      );
      expect(stats.totalExecutions).toBe(3);
      expect(stats.avgConfidence).toBeCloseTo(0.667, 2);
      expect(stats.successRate).toBeCloseTo(0.667, 2); // 2 of 3 > 0.7
    });

    it('should return empty stats for unknown pattern', async () => {
      const stats = await store.getPatternStats(
        'unknown',
        new Date(0),
        new Date()
      );
      expect(stats.totalExecutions).toBe(0);
      expect(stats.avgConfidence).toBe(0);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect z-score anomalies', async () => {
      // Add 15 normal points around 0.8
      for (let i = 0; i < 15; i++) {
        await store.addDataPoint(
          makeDataPoint('a1', 0.78 + Math.random() * 0.04)
        );
      }
      // Add an outlier
      await store.addDataPoint(makeDataPoint('a1', 0.1));

      const anomalies = await store.detectAnomalies('a1', 2);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].confidence).toBe(0.1);
    });

    it('should return empty with insufficient data', async () => {
      await store.addDataPoint(makeDataPoint('a1', 0.5));
      const anomalies = await store.detectAnomalies('a1');
      expect(anomalies).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('should remove data older than retention period', async () => {
      const now = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(now);

      // Old data
      await store.addDataPoint(
        makeDataPoint('a1', 0.9, new Date('2025-01-01T00:00:00Z'))
      );
      // Recent data
      await store.addDataPoint(makeDataPoint('a1', 0.8, now));

      await store.cleanup(7); // 7-day retention
      const result = await store.getDataPoints(
        'a1',
        new Date(0),
        new Date('2025-12-31')
      );
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(0.8);
    });
  });

  describe('clear', () => {
    it('should remove all data', async () => {
      await store.addDataPoint(makeDataPoint('a1', 0.9));
      await store.addDataPoint(makeDataPoint('a2', 0.8));
      await store.clear();
      const result = await store.getDataPoints('a1', new Date(0), new Date());
      expect(result).toEqual([]);
    });
  });
});
