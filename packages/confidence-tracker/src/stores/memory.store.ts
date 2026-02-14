import { EventEmitter } from 'events';
import {
  ConfidenceStore,
  ConfidenceDataPoint,
  AggregationInterval,
  AggregatedDataPoint,
} from '../types';

/**
 * Configuration for the in-memory store
 */
export interface InMemoryStoreConfig {
  /** Maximum data points to retain per entity */
  maxDataPoints?: number;

  /** Retention period in days */
  retentionPeriodDays?: number;

  /** Prune interval in milliseconds */
  pruneIntervalMs?: number;
}

/**
 * In-memory implementation of the ConfidenceStore interface.
 * Suitable for development and testing, or when persistence isn't required.
 */
export class InMemoryStore extends EventEmitter implements ConfidenceStore {
  private dataPoints: ConfidenceDataPoint[] = [];
  private pruneInterval: ReturnType<typeof setInterval> | null = null;

  private readonly config: Required<InMemoryStoreConfig>;

  constructor(config: InMemoryStoreConfig = {}) {
    super();
    this.config = {
      maxDataPoints: config.maxDataPoints ?? 10000,
      retentionPeriodDays: config.retentionPeriodDays ?? 7,
      pruneIntervalMs: config.pruneIntervalMs ?? 60 * 60 * 1000, // 1 hour
    };

    this.startPruning();
  }

  async addDataPoint(dataPoint: ConfidenceDataPoint): Promise<void> {
    this.dataPoints.push(dataPoint);
    this.pruneOldData();
    this.emit('recorded', dataPoint);
  }

  async getDataPoints(
    entityId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ConfidenceDataPoint[]> {
    return this.dataPoints
      .filter(
        (dp) =>
          dp.entityId === entityId &&
          dp.timestamp >= startTime &&
          dp.timestamp <= endTime
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getAggregatedData(
    entityId: string,
    interval: AggregationInterval,
    startTime: Date,
    endTime: Date
  ): Promise<AggregatedDataPoint[]> {
    const intervalMs = this.getIntervalMs(interval);
    const dataByBucket = new Map<number, number[]>();

    this.dataPoints
      .filter((dp) => dp.entityId === entityId)
      .filter((dp) => dp.timestamp >= startTime && dp.timestamp <= endTime)
      .forEach((dp) => {
        const bucket =
          Math.floor(dp.timestamp.getTime() / intervalMs) * intervalMs;
        if (!dataByBucket.has(bucket)) {
          dataByBucket.set(bucket, []);
        }
        dataByBucket.get(bucket)!.push(dp.confidence);
      });

    const results: AggregatedDataPoint[] = [];

    for (const [bucket, confidences] of dataByBucket) {
      const average =
        confidences.reduce((a, b) => a + b, 0) / confidences.length;
      results.push({
        time: new Date(bucket),
        avgConfidence: average,
        count: confidences.length,
      });
    }

    return results.sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  async getCategoryStats(
    category: string,
    startTime: Date,
    endTime: Date
  ): Promise<{
    avgConfidence: number;
    totalExecutions: number;
    successRate: number;
    entityBreakdown: Map<string, number>;
  }> {
    const categoryData = this.dataPoints.filter(
      (dp) =>
        dp.category === category &&
        dp.timestamp >= startTime &&
        dp.timestamp <= endTime
    );

    if (categoryData.length === 0) {
      return {
        avgConfidence: 0,
        totalExecutions: 0,
        successRate: 0,
        entityBreakdown: new Map(),
      };
    }

    const avgConfidence =
      categoryData.reduce((sum, dp) => sum + dp.confidence, 0) /
      categoryData.length;
    const successCount = categoryData.filter((dp) => dp.confidence > 0.7).length;
    const entityBreakdown = new Map<string, number>();

    categoryData.forEach((dp) => {
      entityBreakdown.set(
        dp.entityId,
        (entityBreakdown.get(dp.entityId) || 0) + 1
      );
    });

    return {
      avgConfidence,
      totalExecutions: categoryData.length,
      successRate: successCount / categoryData.length,
      entityBreakdown,
    };
  }

  async detectAnomalies(
    entityId: string,
    threshold: number = 2
  ): Promise<Array<{ time: Date; confidence: number; zscore: number }>> {
    const entityData = this.dataPoints.filter((dp) => dp.entityId === entityId);

    if (entityData.length < 10) {
      return [];
    }

    // Calculate mean and standard deviation
    const confidences = entityData.map((dp) => dp.confidence);
    const mean = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    const variance =
      confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) /
      confidences.length;
    const stdDev = Math.sqrt(variance);

    // Find anomalies
    const anomalies: Array<{ time: Date; confidence: number; zscore: number }> =
      [];

    entityData.forEach((dp) => {
      if (stdDev === 0) return;
      const zscore = Math.abs((dp.confidence - mean) / stdDev);
      if (zscore > threshold) {
        anomalies.push({
          time: dp.timestamp,
          confidence: dp.confidence,
          zscore,
        });
      }
    });

    return anomalies;
  }

  async cleanup(retentionPeriodDays: number): Promise<void> {
    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - retentionPeriodDays);
    this.dataPoints = this.dataPoints.filter((dp) => dp.timestamp > cutoffTime);
  }

  async clear(): Promise<void> {
    this.dataPoints = [];
  }

  /**
   * Query data points with filters
   */
  async query(params: {
    entityIds?: string[];
    categories?: string[];
    startTime?: Date;
    endTime?: Date;
    minConfidence?: number;
    maxConfidence?: number;
    limit?: number;
  }): Promise<ConfidenceDataPoint[]> {
    let results = [...this.dataPoints];

    if (params.entityIds?.length) {
      results = results.filter((dp) => params.entityIds!.includes(dp.entityId));
    }

    if (params.categories?.length) {
      results = results.filter((dp) => params.categories!.includes(dp.category));
    }

    if (params.startTime) {
      results = results.filter((dp) => dp.timestamp >= params.startTime!);
    }

    if (params.endTime) {
      results = results.filter((dp) => dp.timestamp <= params.endTime!);
    }

    if (params.minConfidence !== undefined) {
      results = results.filter((dp) => dp.confidence >= params.minConfidence!);
    }

    if (params.maxConfidence !== undefined) {
      results = results.filter((dp) => dp.confidence <= params.maxConfidence!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (params.limit) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  /**
   * Get all unique entity IDs
   */
  getEntityIds(): string[] {
    return [...new Set(this.dataPoints.map((dp) => dp.entityId))];
  }

  /**
   * Get count of data points
   */
  getCount(): number {
    return this.dataPoints.length;
  }

  /**
   * Stop the pruning interval
   */
  destroy(): void {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }
  }

  private pruneOldData(): void {
    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - this.config.retentionPeriodDays);

    const beforeCount = this.dataPoints.length;
    this.dataPoints = this.dataPoints.filter((dp) => dp.timestamp > cutoffTime);

    if (beforeCount > this.dataPoints.length) {
      this.emit('pruned', { removed: beforeCount - this.dataPoints.length });
    }

    // Enforce max data points
    if (this.dataPoints.length > this.config.maxDataPoints) {
      this.dataPoints = this.dataPoints.slice(-this.config.maxDataPoints);
    }
  }

  private startPruning(): void {
    this.pruneInterval = setInterval(() => {
      this.pruneOldData();
    }, this.config.pruneIntervalMs);
  }

  private getIntervalMs(interval: AggregationInterval): number {
    switch (interval) {
      case 'minute':
        return 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
    }
  }
}
