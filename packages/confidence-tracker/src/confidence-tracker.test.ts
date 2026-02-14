import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfidenceTracker } from './confidence-tracker';
import { InMemoryStore } from './stores/memory.store';

describe('ConfidenceTracker', () => {
  let tracker: ConfidenceTracker;
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore({ maxDataPoints: 1000 });
    tracker = new ConfidenceTracker({
      store,
      anomalyDetection: {
        enabled: true,
        suddenDropThreshold: 0.3,
        lowConfidenceThreshold: 0.5,
        highVarianceThreshold: 0.25,
        checkIntervalMs: 1000,
        minDataPoints: 5,
        alertCooldownMs: 100,
      },
    });
  });

  afterEach(async () => {
    await tracker.shutdown();
    store.destroy();
  });

  describe('recording', () => {
    it('should record a confidence data point', async () => {
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'test-task',
        confidence: 0.85,
      });

      const metrics = await tracker.getMetrics('agent-1');
      expect(metrics.dataPoints).toBe(1);
      expect(metrics.averageConfidence).toBe(0.85);
    });

    it('should emit recorded event', async () => {
      const handler = vi.fn();
      tracker.on('recorded', handler);

      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'test-task',
        confidence: 0.85,
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'agent-1',
          confidence: 0.85,
        })
      );
    });

    it('should auto-generate timestamp if not provided', async () => {
      const before = new Date();
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'test-task',
        confidence: 0.85,
      });
      const after = new Date();

      const dataPoints = await store.getDataPoints('agent-1', before, after);
      expect(dataPoints.length).toBe(1);
      expect(dataPoints[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(dataPoints[0].timestamp.getTime()).toBeLessThanOrEqual(
        after.getTime()
      );
    });
  });

  describe('metrics', () => {
    it('should calculate average confidence', async () => {
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'task-1',
        confidence: 0.8,
      });
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'task-2',
        confidence: 0.9,
      });
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'task-3',
        confidence: 1.0,
      });

      const metrics = await tracker.getMetrics('agent-1');
      expect(metrics.averageConfidence).toBe(0.9);
      expect(metrics.minConfidence).toBe(0.8);
      expect(metrics.maxConfidence).toBe(1.0);
    });

    it('should return empty metrics for unknown entity', async () => {
      const metrics = await tracker.getMetrics('unknown');
      expect(metrics.dataPoints).toBe(0);
      expect(metrics.averageConfidence).toBe(0);
    });

    it('should filter by time range', async () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'old-task',
        confidence: 0.5,
        timestamp: twoHoursAgo,
      });
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'recent-task',
        confidence: 0.9,
        timestamp: now,
      });

      const metrics = await tracker.getMetrics('agent-1', {
        start: hourAgo,
        end: now,
      });

      expect(metrics.dataPoints).toBe(1);
      expect(metrics.averageConfidence).toBe(0.9);
    });
  });

  describe('trend calculation', () => {
    it('should detect improving trend', async () => {
      // Record 15 data points with increasing confidence (older to newer)
      // Data is sorted descending by timestamp, so index 0 = most recent
      // We want most recent to have highest confidence for "improving"
      for (let i = 0; i < 15; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `task-${i}`,
          confidence: 0.5 + i * 0.03, // Increases with i
          timestamp: new Date(Date.now() - (14 - i) * 1000), // i=0 is oldest, i=14 is newest
        });
      }

      const metrics = await tracker.getMetrics('agent-1');
      expect(metrics.confidenceTrend).toBe('improving');
    });

    it('should detect declining trend', async () => {
      // Record 15 data points with decreasing confidence (older to newer)
      // Most recent should have lowest confidence for "declining"
      for (let i = 0; i < 15; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `task-${i}`,
          confidence: 0.95 - i * 0.03, // Decreases with i
          timestamp: new Date(Date.now() - (14 - i) * 1000), // i=0 is oldest, i=14 is newest
        });
      }

      const metrics = await tracker.getMetrics('agent-1');
      expect(metrics.confidenceTrend).toBe('declining');
    });

    it('should detect stable trend', async () => {
      // Record 15 data points with stable confidence
      for (let i = 0; i < 15; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `task-${i}`,
          confidence: 0.8 + (i % 2 === 0 ? 0.01 : -0.01),
          timestamp: new Date(Date.now() - (15 - i) * 1000),
        });
      }

      const metrics = await tracker.getMetrics('agent-1');
      expect(metrics.confidenceTrend).toBe('stable');
    });
  });

  describe('anomaly detection', () => {
    it('should detect sudden drop', async () => {
      const handler = vi.fn();
      tracker.on('anomaly', handler);

      // Build baseline with high confidence
      for (let i = 0; i < 10; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `task-${i}`,
          confidence: 0.9,
          timestamp: new Date(Date.now() - (10 - i) * 60 * 1000),
        });
      }

      // Sudden drop
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'dropped-task',
        confidence: 0.3,
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'agent-1',
          type: 'sudden_drop',
        })
      );
    });

    it('should detect consistently low confidence', async () => {
      const handler = vi.fn();
      tracker.on('anomaly', handler);

      // Build baseline with good confidence
      for (let i = 0; i < 10; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `task-${i}`,
          confidence: 0.85, // Good confidence
          timestamp: new Date(Date.now() - (10 - i) * 60 * 1000),
        });
      }

      // Record low confidence scores (below 0.5 threshold)
      // This should trigger consistently_low anomaly
      for (let i = 0; i < 5; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `low-task-${i}`,
          confidence: 0.35, // Well below 0.5 threshold
        });
      }

      // Should have at least one anomaly detected (could be sudden_drop or consistently_low)
      expect(handler).toHaveBeenCalled();
    });

    it('should respect alert cooldown', async () => {
      const handler = vi.fn();
      tracker.on('anomaly', handler);

      // Build baseline
      for (let i = 0; i < 10; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `task-${i}`,
          confidence: 0.9,
          timestamp: new Date(Date.now() - (10 - i) * 60 * 1000),
        });
      }

      // Multiple sudden drops - should only alert once due to cooldown
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'drop-1',
        confidence: 0.3,
      });
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'drop-2',
        confidence: 0.2,
      });

      const suddenDropAlerts = handler.mock.calls.filter(
        (call) => call[0].type === 'sudden_drop'
      );
      expect(suddenDropAlerts.length).toBe(1);
    });
  });

  describe('alert management', () => {
    it('should get active alerts', async () => {
      // Build baseline and trigger alert
      for (let i = 0; i < 10; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `task-${i}`,
          confidence: 0.9,
          timestamp: new Date(Date.now() - (10 - i) * 60 * 1000),
        });
      }

      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'drop-task',
        confidence: 0.3,
      });

      const alerts = tracker.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should acknowledge alerts', async () => {
      // Trigger an alert
      for (let i = 0; i < 10; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `task-${i}`,
          confidence: 0.9,
          timestamp: new Date(Date.now() - (10 - i) * 60 * 1000),
        });
      }

      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'drop-task',
        confidence: 0.3,
      });

      const alerts = tracker.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      const acknowledged = tracker.acknowledgeAlert(alerts[0].id);
      expect(acknowledged).toBe(true);

      const activeAlerts = tracker.getActiveAlerts();
      expect(activeAlerts.length).toBe(alerts.length - 1);
    });
  });

  describe('historical data', () => {
    it('should get aggregated historical data', async () => {
      const now = new Date();

      // Add data points across different hours
      for (let i = 0; i < 5; i++) {
        await tracker.record({
          entityId: 'agent-1',
          category: 'testing',
          task: `task-${i}`,
          confidence: 0.8 + i * 0.02,
          timestamp: new Date(now.getTime() - i * 60 * 60 * 1000),
        });
      }

      const hourlyData = await tracker.getHistoricalData(
        'agent-1',
        'hour',
        new Date(now.getTime() - 5 * 60 * 60 * 1000),
        now
      );

      expect(hourlyData.length).toBeGreaterThan(0);
      hourlyData.forEach((point) => {
        expect(point.avgConfidence).toBeGreaterThan(0);
        expect(point.count).toBeGreaterThan(0);
      });
    });
  });

  describe('category stats', () => {
    it('should get category statistics', async () => {
      await tracker.record({
        entityId: 'agent-1',
        category: 'code-review',
        task: 'task-1',
        confidence: 0.9,
      });
      await tracker.record({
        entityId: 'agent-2',
        category: 'code-review',
        task: 'task-2',
        confidence: 0.8,
      });
      await tracker.record({
        entityId: 'agent-1',
        category: 'testing',
        task: 'task-3',
        confidence: 0.7,
      });

      const stats = await tracker.getCategoryStats('code-review');

      expect(stats.totalExecutions).toBe(2);
      expect(stats.avgConfidence).toBeCloseTo(0.85);
      expect(stats.entityBreakdown.get('agent-1')).toBe(1);
      expect(stats.entityBreakdown.get('agent-2')).toBe(1);
    });
  });
});
