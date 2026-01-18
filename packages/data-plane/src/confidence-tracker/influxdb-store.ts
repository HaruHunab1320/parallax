/**
 * InfluxDB-backed confidence store for persistent time-series metrics
 */

import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { ConfidenceStore, ConfidenceDataPoint, AggregationInterval } from './types';

export interface InfluxDBStoreConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  retentionPeriodDays?: number;
}

export class InfluxDBConfidenceStore implements ConfidenceStore {
  private influx: InfluxDB;
  private writeApi: WriteApi;
  private queryApi: QueryApi;
  private config: InfluxDBStoreConfig;
  
  constructor(config: InfluxDBStoreConfig) {
    this.config = config;
    this.influx = new InfluxDB({
      url: config.url,
      token: config.token,
    });
    
    this.writeApi = this.influx.getWriteApi(config.org, config.bucket);
    this.queryApi = this.influx.getQueryApi(config.org);
    
    // Set default tags for all points
    this.writeApi.useDefaultTags({ service: 'parallax' });
  }
  
  async addDataPoint(point: ConfidenceDataPoint): Promise<void> {
    const influxPoint = new Point('confidence')
      .tag('agent_id', point.agentId)
      .tag('pattern', point.pattern)
      .tag('task', point.task)
      .floatField('value', point.confidence)
      .timestamp(point.timestamp);
    
    // Add optional tags
    if (point.metadata) {
      Object.entries(point.metadata).forEach(([key, value]) => {
        if (typeof value === 'string') {
          influxPoint.tag(`meta_${key}`, value);
        } else if (typeof value === 'number') {
          influxPoint.floatField(`meta_${key}`, value);
        }
      });
    }
    
    this.writeApi.writePoint(influxPoint);
    
    // Flush immediately for real-time updates
    await this.writeApi.flush();
  }
  
  async getDataPoints(
    agentId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ConfidenceDataPoint[]> {
    const query = `
      from(bucket: "${this.config.bucket}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "confidence")
        |> filter(fn: (r) => r.agent_id == "${agentId}")
        |> filter(fn: (r) => r._field == "value")
        |> sort(columns: ["_time"])
    `;
    
    const points: ConfidenceDataPoint[] = [];
    
    await new Promise<void>((resolve, reject) => {
      this.queryApi.queryRows(query, {
        next(row, tableMeta) {
          const record = tableMeta.toObject(row);
          points.push({
            agentId: record.agent_id,
            pattern: record.pattern,
            task: record.task,
            confidence: record._value,
            timestamp: new Date(record._time),
            metadata: Object.entries(record).reduce((acc, [key, value]) => {
              if (key.startsWith('meta_')) {
                acc[key.slice(5)] = value;
              }
              return acc;
            }, {} as Record<string, any>)
          });
        },
        error(error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
    });
    
    return points;
  }
  
  async getAggregatedData(
    agentId: string,
    interval: AggregationInterval,
    startTime: Date,
    endTime: Date
  ): Promise<{ time: Date; avgConfidence: number; count: number }[]> {
    const windowPeriod = this.getWindowPeriod(interval);
    
    const query = `
      from(bucket: "${this.config.bucket}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "confidence")
        |> filter(fn: (r) => r.agent_id == "${agentId}")
        |> filter(fn: (r) => r._field == "value")
        |> aggregateWindow(
            every: ${windowPeriod},
            fn: mean,
            createEmpty: false
          )
        |> yield(name: "mean")
      
      from(bucket: "${this.config.bucket}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "confidence")
        |> filter(fn: (r) => r.agent_id == "${agentId}")
        |> filter(fn: (r) => r._field == "value")
        |> aggregateWindow(
            every: ${windowPeriod},
            fn: count,
            createEmpty: false
          )
        |> yield(name: "count")
    `;
    
    const results = new Map<string, { avgConfidence?: number; count?: number }>();
    
    await new Promise<void>((resolve, reject) => {
      this.queryApi.queryRows(query, {
        next(row, tableMeta) {
          const record = tableMeta.toObject(row);
          const timeKey = record._time;
          
          if (!results.has(timeKey)) {
            results.set(timeKey, {});
          }
          
          const entry = results.get(timeKey)!;
          if (record.result === 'mean') {
            entry.avgConfidence = record._value;
          } else if (record.result === 'count') {
            entry.count = record._value;
          }
        },
        error(error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
    });
    
    return Array.from(results.entries())
      .map(([time, data]) => ({
        time: new Date(time),
        avgConfidence: data.avgConfidence || 0,
        count: data.count || 0,
      }))
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }
  
  async getPatternStats(
    pattern: string,
    startTime: Date,
    endTime: Date
  ): Promise<{
    avgConfidence: number;
    totalExecutions: number;
    successRate: number;
    agentBreakdown: Map<string, number>;
  }> {
    const query = `
      import "influxdata/influxdb/schema"
      
      data = from(bucket: "${this.config.bucket}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "confidence")
        |> filter(fn: (r) => r.pattern == "${pattern}")
        |> filter(fn: (r) => r._field == "value")
      
      // Average confidence
      avgConf = data
        |> mean()
        |> findRecord(fn: (key) => true, idx: 0)
      
      // Total executions
      total = data
        |> count()
        |> findRecord(fn: (key) => true, idx: 0)
      
      // Success rate (confidence > 0.7)
      success = data
        |> filter(fn: (r) => r._value > 0.7)
        |> count()
        |> findRecord(fn: (key) => true, idx: 0)
      
      // Agent breakdown
      agentStats = data
        |> group(columns: ["agent_id"])
        |> count()
    `;
    
    let avgConfidence = 0;
    let totalExecutions = 0;
    let successCount = 0;
    const agentBreakdown = new Map<string, number>();
    
    await new Promise<void>((resolve, reject) => {
      this.queryApi.queryRows(query, {
        next(row, tableMeta) {
          const record = tableMeta.toObject(row);
          
          if (record.result === 'avgConf') {
            avgConfidence = record._value || 0;
          } else if (record.result === 'total') {
            totalExecutions = record._value || 0;
          } else if (record.result === 'success') {
            successCount = record._value || 0;
          } else if (record.result === 'agentStats' && record.agent_id) {
            agentBreakdown.set(record.agent_id, record._value || 0);
          }
        },
        error(error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
    });
    
    return {
      avgConfidence,
      totalExecutions,
      successRate: totalExecutions > 0 ? successCount / totalExecutions : 0,
      agentBreakdown,
    };
  }
  
  async detectAnomalies(
    agentId: string,
    threshold: number = 2
  ): Promise<Array<{ time: Date; confidence: number; zscore: number }>> {
    // Use InfluxDB's built-in anomaly detection
    const query = `
      import "contrib/anaisdg/anomalydetection"
      
      from(bucket: "${this.config.bucket}")
        |> range(start: -7d)
        |> filter(fn: (r) => r._measurement == "confidence")
        |> filter(fn: (r) => r.agent_id == "${agentId}")
        |> filter(fn: (r) => r._field == "value")
        |> anomalydetection.mad(threshold: ${threshold})
        |> filter(fn: (r) => r.anomaly == true)
    `;
    
    const anomalies: Array<{ time: Date; confidence: number; zscore: number }> = [];
    
    await new Promise<void>((resolve, reject) => {
      this.queryApi.queryRows(query, {
        next(row, tableMeta) {
          const record = tableMeta.toObject(row);
          anomalies.push({
            time: new Date(record._time),
            confidence: record._value,
            zscore: record.zscore || 0,
          });
        },
        error(error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
    });
    
    return anomalies;
  }
  
  async cleanup(_retentionPeriod: number): Promise<void> {
    // InfluxDB handles retention automatically based on bucket retention policy
    // This method is here for interface compatibility
    // You can configure retention when creating the bucket
  }
  
  async close(): Promise<void> {
    await this.writeApi.close();
  }
  
  private getWindowPeriod(interval: AggregationInterval): string {
    switch (interval) {
      case 'minute':
        return '1m';
      case 'hour':
        return '1h';
      case 'day':
        return '1d';
      default:
        return '1h';
    }
  }
}
