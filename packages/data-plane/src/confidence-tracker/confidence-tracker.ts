import { 
  ConfidenceDataPoint, 
  ConfidenceMetrics, 
  ConfidenceQuery,
  ConfidenceAnomalyAlert 
} from './types';
import { InMemoryConfidenceStore, ConfidenceStoreConfig } from './confidence-store';
import { EventEmitter } from 'events';
import { Logger } from 'pino';

export interface ConfidenceTrackerConfig extends ConfidenceStoreConfig {
  anomalyDetection: {
    enabled: boolean;
    suddenDropThreshold: number; // e.g., 0.3 (30% drop)
    lowConfidenceThreshold: number; // e.g., 0.5
    highVarianceThreshold: number; // e.g., 0.2
    checkIntervalMs: number;
  };
}

export class ConfidenceTracker extends EventEmitter {
  private store: InMemoryConfidenceStore;
  private anomalyAlerts: Map<string, ConfidenceAnomalyAlert> = new Map();
  private agentBaselines: Map<string, { average: number; stdDev: number }> = new Map();

  constructor(
    private config: ConfidenceTrackerConfig,
    private logger: Logger
  ) {
    super();
    this.store = new InMemoryConfidenceStore(config);
    
    if (config.anomalyDetection.enabled) {
      this.startAnomalyDetection();
    }
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.store.on('confidence:recorded', (dataPoint: ConfidenceDataPoint) => {
      this.logger.debug(
        { agentId: dataPoint.agentId, confidence: dataPoint.confidence },
        'Confidence recorded'
      );
      
      // Update baseline for anomaly detection
      this.updateAgentBaseline(dataPoint.agentId);
    });
  }

  async recordConfidence(dataPoint: ConfidenceDataPoint): Promise<void> {
    await this.store.store(dataPoint);
    
    // Check for immediate anomalies
    if (this.config.anomalyDetection.enabled) {
      await this.checkForAnomalies(dataPoint.agentId);
    }
  }

  async getMetrics(
    agentId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<ConfidenceMetrics> {
    const query: ConfidenceQuery = {
      agentIds: [agentId],
      startTime: timeRange?.start,
      endTime: timeRange?.end,
    };
    
    const dataPoints = await this.store.query(query);
    
    if (dataPoints.length === 0) {
      return {
        agentId,
        averageConfidence: 0,
        minConfidence: 0,
        maxConfidence: 0,
        confidenceTrend: 'stable',
        dataPoints: 0,
        timeRange: timeRange || { start: new Date(), end: new Date() },
      };
    }
    
    const confidences = dataPoints.map(dp => dp.confidence);
    const average = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const min = Math.min(...confidences);
    const max = Math.max(...confidences);
    
    // Calculate trend
    const trend = this.calculateTrend(dataPoints);
    
    return {
      agentId,
      averageConfidence: average,
      minConfidence: min,
      maxConfidence: max,
      confidenceTrend: trend,
      dataPoints: dataPoints.length,
      timeRange: {
        start: timeRange?.start || dataPoints[dataPoints.length - 1].timestamp,
        end: timeRange?.end || dataPoints[0].timestamp,
      },
    };
  }

  private calculateTrend(
    dataPoints: ConfidenceDataPoint[]
  ): 'improving' | 'stable' | 'declining' {
    if (dataPoints.length < 10) return 'stable';
    
    // Simple linear regression on recent data
    const recentPoints = dataPoints.slice(0, Math.min(20, dataPoints.length));
    const n = recentPoints.length;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    recentPoints.forEach((dp, i) => {
      sumX += i;
      sumY += dp.confidence;
      sumXY += i * dp.confidence;
      sumX2 += i * i;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    if (slope > 0.01) return 'improving';
    if (slope < -0.01) return 'declining';
    return 'stable';
  }

  private async updateAgentBaseline(agentId: string): Promise<void> {
    const recentData = await this.store.query({
      agentIds: [agentId],
      limit: 100,
    });
    
    if (recentData.length < 10) return;
    
    const confidences = recentData.map(dp => dp.confidence);
    const average = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    
    // Calculate standard deviation
    const variance = confidences.reduce((acc, conf) => {
      return acc + Math.pow(conf - average, 2);
    }, 0) / confidences.length;
    
    const stdDev = Math.sqrt(variance);
    
    this.agentBaselines.set(agentId, { average, stdDev });
  }

  private async checkForAnomalies(agentId: string): Promise<void> {
    const baseline = this.agentBaselines.get(agentId);
    if (!baseline) return;
    
    const recentData = await this.store.query({
      agentIds: [agentId],
      limit: 5,
    });
    
    if (recentData.length === 0) return;
    
    const latestConfidence = recentData[0].confidence;
    
    // Check for sudden drop
    if (baseline.average - latestConfidence > this.config.anomalyDetection.suddenDropThreshold) {
      this.createAnomaly(agentId, 'sudden_drop', {
        currentConfidence: latestConfidence,
        historicalAverage: baseline.average,
        deviation: baseline.average - latestConfidence,
      });
    }
    
    // Check for consistently low confidence
    const recentAverage = recentData.reduce((a, b) => a + b.confidence, 0) / recentData.length;
    if (recentAverage < this.config.anomalyDetection.lowConfidenceThreshold) {
      this.createAnomaly(agentId, 'consistently_low', {
        currentConfidence: recentAverage,
        historicalAverage: baseline.average,
        deviation: baseline.average - recentAverage,
      });
    }
    
    // Check for high variance
    if (baseline.stdDev > this.config.anomalyDetection.highVarianceThreshold) {
      this.createAnomaly(agentId, 'high_variance', {
        currentConfidence: latestConfidence,
        historicalAverage: baseline.average,
        deviation: baseline.stdDev,
      });
    }
  }

  private createAnomaly(
    agentId: string,
    type: 'sudden_drop' | 'consistently_low' | 'high_variance',
    details: any
  ): void {
    const alert: ConfidenceAnomalyAlert = {
      id: `${agentId}-${type}-${Date.now()}`,
      agentId,
      type,
      severity: this.calculateSeverity(type, details.deviation),
      detectedAt: new Date(),
      details,
    };
    
    this.anomalyAlerts.set(alert.id, alert);
    
    this.logger.warn({ alert }, 'Confidence anomaly detected');
    this.emit('anomaly:detected', alert);
  }

  private calculateSeverity(
    type: string,
    deviation: number
  ): 'low' | 'medium' | 'high' {
    if (type === 'sudden_drop') {
      if (deviation > 0.5) return 'high';
      if (deviation > 0.3) return 'medium';
      return 'low';
    }
    
    if (type === 'high_variance') {
      if (deviation > 0.3) return 'high';
      if (deviation > 0.2) return 'medium';
      return 'low';
    }
    
    return 'medium';
  }

  private startAnomalyDetection(): void {
    setInterval(async () => {
      const agents = Array.from(this.agentBaselines.keys());
      
      for (const agentId of agents) {
        await this.checkForAnomalies(agentId);
      }
    }, this.config.anomalyDetection.checkIntervalMs);
  }

  getActiveAlerts(): ConfidenceAnomalyAlert[] {
    return Array.from(this.anomalyAlerts.values())
      .filter(alert => {
        // Alerts expire after 1 hour
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return alert.detectedAt > hourAgo;
      });
  }

  async getHistoricalData(
    agentId: string,
    interval: 'minute' | 'hour' | 'day',
    startTime?: Date,
    endTime?: Date
  ) {
    return this.store.getAggregatedData(agentId, interval, startTime, endTime);
  }

  async shutdown(): Promise<void> {
    await this.store.clear();
    this.removeAllListeners();
  }
}