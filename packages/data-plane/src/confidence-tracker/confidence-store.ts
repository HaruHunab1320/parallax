import { ConfidenceDataPoint, ConfidenceQuery } from './types';
import { EventEmitter } from 'events';

export interface ConfidenceStoreConfig {
  maxDataPoints: number;
  retentionPeriodDays: number;
  aggregationIntervals: {
    minute: number;
    hour: number;
    day: number;
  };
}

export class InMemoryConfidenceStore extends EventEmitter {
  private dataPoints: ConfidenceDataPoint[] = [];
  private aggregatedData: Map<string, Map<string, number[]>> = new Map();

  constructor(private config: ConfidenceStoreConfig) {
    super();
    this.startAggregation();
  }

  async store(dataPoint: ConfidenceDataPoint): Promise<void> {
    this.dataPoints.push(dataPoint);
    
    // Clean up old data
    this.pruneOldData();
    
    // Emit event for real-time monitoring
    this.emit('confidence:recorded', dataPoint);
    
    // Trigger aggregation
    this.updateAggregations(dataPoint);
  }

  async query(query: ConfidenceQuery): Promise<ConfidenceDataPoint[]> {
    let results = [...this.dataPoints];
    
    // Apply filters
    if (query.agentIds?.length) {
      results = results.filter(dp => query.agentIds!.includes(dp.agentId));
    }
    
    if (query.patternNames?.length) {
      results = results.filter(dp => 
        dp.patternName && query.patternNames!.includes(dp.patternName)
      );
    }
    
    if (query.startTime) {
      results = results.filter(dp => dp.timestamp >= query.startTime!);
    }
    
    if (query.endTime) {
      results = results.filter(dp => dp.timestamp <= query.endTime!);
    }
    
    if (query.minConfidence !== undefined) {
      results = results.filter(dp => dp.confidence >= query.minConfidence!);
    }
    
    if (query.maxConfidence !== undefined) {
      results = results.filter(dp => dp.confidence <= query.maxConfidence!);
    }
    
    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    
    return results;
  }

  async getAggregatedData(
    agentId: string,
    interval: 'minute' | 'hour' | 'day',
    startTime?: Date,
    endTime?: Date
  ): Promise<Array<{ timestamp: Date; average: number; count: number }>> {
    const agentData = this.aggregatedData.get(agentId);
    if (!agentData) return [];
    
    const intervalData = agentData.get(interval);
    if (!intervalData) return [];
    
    // Convert to structured format
    const results: Array<{ timestamp: Date; average: number; count: number }> = [];
    
    // This is a simplified implementation
    // In production, would use proper time-series aggregation
    const intervalMs = this.getIntervalMs(interval);
    const dataByBucket = new Map<number, number[]>();
    
    this.dataPoints
      .filter(dp => dp.agentId === agentId)
      .filter(dp => !startTime || dp.timestamp >= startTime)
      .filter(dp => !endTime || dp.timestamp <= endTime)
      .forEach(dp => {
        const bucket = Math.floor(dp.timestamp.getTime() / intervalMs) * intervalMs;
        if (!dataByBucket.has(bucket)) {
          dataByBucket.set(bucket, []);
        }
        dataByBucket.get(bucket)!.push(dp.confidence);
      });
    
    for (const [bucket, confidences] of dataByBucket) {
      const average = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      results.push({
        timestamp: new Date(bucket),
        average,
        count: confidences.length,
      });
    }
    
    return results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private pruneOldData(): void {
    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - this.config.retentionPeriodDays);
    
    const beforeCount = this.dataPoints.length;
    this.dataPoints = this.dataPoints.filter(dp => dp.timestamp > cutoffTime);
    
    if (beforeCount > this.dataPoints.length) {
      this.emit('data:pruned', { removed: beforeCount - this.dataPoints.length });
    }
    
    // Also enforce max data points
    if (this.dataPoints.length > this.config.maxDataPoints) {
      this.dataPoints = this.dataPoints.slice(-this.config.maxDataPoints);
    }
  }

  private updateAggregations(dataPoint: ConfidenceDataPoint): void {
    if (!this.aggregatedData.has(dataPoint.agentId)) {
      this.aggregatedData.set(dataPoint.agentId, new Map());
    }
    
    const agentData = this.aggregatedData.get(dataPoint.agentId)!;
    
    // Update each aggregation interval
    ['minute', 'hour', 'day'].forEach(interval => {
      if (!agentData.has(interval)) {
        agentData.set(interval, []);
      }
      agentData.get(interval)!.push(dataPoint.confidence);
    });
  }

  private startAggregation(): void {
    // Periodic cleanup and aggregation
    setInterval(() => {
      this.pruneOldData();
    }, 60 * 60 * 1000); // Every hour
  }

  private getIntervalMs(interval: 'minute' | 'hour' | 'day'): number {
    switch (interval) {
      case 'minute': return 60 * 1000;
      case 'hour': return 60 * 60 * 1000;
      case 'day': return 24 * 60 * 60 * 1000;
    }
  }

  async clear(): Promise<void> {
    this.dataPoints = [];
    this.aggregatedData.clear();
  }
}