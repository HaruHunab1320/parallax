import { EventEmitter } from 'events';
import {
  ConfidenceDataPoint,
  ConfidenceMetrics,
  ConfidenceAnomalyAlert,
  ConfidenceTrackerConfig,
  ConfidenceStore,
  AnomalyDetectionConfig,
  Logger,
} from './types';

/**
 * Default logger that does nothing
 */
const nullLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Confidence tracker for monitoring and analyzing confidence scores
 * with built-in anomaly detection.
 *
 * @example
 * ```typescript
 * import { ConfidenceTracker, InMemoryStore } from '@parallax/confidence-tracker';
 *
 * const tracker = new ConfidenceTracker({
 *   store: new InMemoryStore(),
 *   anomalyDetection: {
 *     enabled: true,
 *     suddenDropThreshold: 0.3,
 *     lowConfidenceThreshold: 0.5,
 *     highVarianceThreshold: 0.25,
 *     checkIntervalMs: 60000,
 *   },
 * });
 *
 * await tracker.record({
 *   entityId: 'agent-123',
 *   category: 'code-review',
 *   task: 'review-pr-456',
 *   confidence: 0.85,
 * });
 *
 * tracker.on('anomaly', (alert) => {
 *   console.log('Anomaly detected:', alert);
 * });
 * ```
 */
export class ConfidenceTracker extends EventEmitter {
  private readonly store: ConfidenceStore;
  private readonly anomalyConfig?: AnomalyDetectionConfig;
  private readonly logger: Logger;

  private anomalyAlerts: Map<string, ConfidenceAnomalyAlert> = new Map();
  private entityBaselines: Map<string, { average: number; stdDev: number }> =
    new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastAlertTimes: Map<string, number> = new Map();

  constructor(config: ConfidenceTrackerConfig) {
    super();
    this.store = config.store;
    this.anomalyConfig = config.anomalyDetection;
    this.logger = config.logger ?? nullLogger;

    if (this.anomalyConfig?.enabled) {
      this.startAnomalyDetection();
    }
  }

  /**
   * Record a confidence data point
   */
  async record(
    dataPoint: Omit<ConfidenceDataPoint, 'timestamp'> & { timestamp?: Date }
  ): Promise<void> {
    const point: ConfidenceDataPoint = {
      ...dataPoint,
      timestamp: dataPoint.timestamp ?? new Date(),
    };

    await this.store.addDataPoint(point);
    this.emit('recorded', point);

    this.logger.debug('Confidence recorded', {
      entityId: point.entityId,
      confidence: point.confidence,
    });

    // Update baseline and check for immediate anomalies
    if (this.anomalyConfig?.enabled) {
      await this.updateEntityBaseline(point.entityId);
      await this.checkForAnomalies(point.entityId);
    }
  }

  /**
   * Get aggregated metrics for an entity
   */
  async getMetrics(
    entityId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<ConfidenceMetrics> {
    const end = timeRange?.end ?? new Date();
    const start =
      timeRange?.start ?? new Date(end.getTime() - 24 * 60 * 60 * 1000);

    const dataPoints = await this.store.getDataPoints(entityId, start, end);

    if (dataPoints.length === 0) {
      return {
        entityId,
        averageConfidence: 0,
        minConfidence: 0,
        maxConfidence: 0,
        confidenceTrend: 'stable',
        dataPoints: 0,
        timeRange: { start, end },
      };
    }

    const confidences = dataPoints.map((dp) => dp.confidence);
    const average =
      confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const min = Math.min(...confidences);
    const max = Math.max(...confidences);
    const trend = this.calculateTrend(dataPoints);

    return {
      entityId,
      averageConfidence: average,
      minConfidence: min,
      maxConfidence: max,
      confidenceTrend: trend,
      dataPoints: dataPoints.length,
      timeRange: { start, end },
    };
  }

  /**
   * Get historical data aggregated by time interval
   */
  async getHistoricalData(
    entityId: string,
    interval: 'minute' | 'hour' | 'day',
    startTime?: Date,
    endTime?: Date
  ) {
    const end = endTime ?? new Date();
    const start =
      startTime ?? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000); // Default 7 days

    return this.store.getAggregatedData(entityId, interval, start, end);
  }

  /**
   * Get all active anomaly alerts
   */
  getActiveAlerts(): ConfidenceAnomalyAlert[] {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return Array.from(this.anomalyAlerts.values()).filter(
      (alert) => alert.detectedAt > hourAgo && !alert.acknowledged
    );
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.anomalyAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('anomaly:resolved', { alertId, entityId: alert.entityId });
      return true;
    }
    return false;
  }

  /**
   * Get statistics for a category
   */
  async getCategoryStats(
    category: string,
    startTime?: Date,
    endTime?: Date
  ) {
    const end = endTime ?? new Date();
    const start =
      startTime ?? new Date(end.getTime() - 24 * 60 * 60 * 1000);

    return this.store.getCategoryStats(category, start, end);
  }

  /**
   * Shutdown the tracker
   */
  async shutdown(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.removeAllListeners();
    this.logger.info('Confidence tracker shutdown');
  }

  // ─────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────

  private calculateTrend(
    dataPoints: ConfidenceDataPoint[]
  ): 'improving' | 'stable' | 'declining' {
    if (dataPoints.length < 10) return 'stable';

    // Simple linear regression on recent data
    // Data is sorted descending by timestamp (index 0 = most recent)
    const recentPoints = dataPoints.slice(0, Math.min(20, dataPoints.length));
    const n = recentPoints.length;

    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    recentPoints.forEach((dp, i) => {
      sumX += i;
      sumY += dp.confidence;
      sumXY += i * dp.confidence;
      sumX2 += i * i;
    });

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 'stable';

    const slope = (n * sumXY - sumX * sumY) / denominator;

    // Since data is sorted descending (index 0 = newest):
    // - Positive slope means confidence increases as we go to older data = declining
    // - Negative slope means confidence decreases as we go to older data = improving
    if (slope < -0.01) return 'improving';
    if (slope > 0.01) return 'declining';
    return 'stable';
  }

  private async updateEntityBaseline(entityId: string): Promise<void> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    const recentData = await this.store.getDataPoints(
      entityId,
      startTime,
      endTime
    );

    const minDataPoints = this.anomalyConfig?.minDataPoints ?? 10;
    if (recentData.length < minDataPoints) return;

    const confidences = recentData.map((dp) => dp.confidence);
    const average =
      confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance =
      confidences.reduce((acc, conf) => acc + Math.pow(conf - average, 2), 0) /
      confidences.length;
    const stdDev = Math.sqrt(variance);

    this.entityBaselines.set(entityId, { average, stdDev });
  }

  private async checkForAnomalies(entityId: string): Promise<void> {
    if (!this.anomalyConfig) return;

    const baseline = this.entityBaselines.get(entityId);
    if (!baseline) return;

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000);
    const recentData = await this.store.getDataPoints(
      entityId,
      startTime,
      endTime
    );

    if (recentData.length === 0) return;

    const latestConfidence = recentData[0].confidence;

    // Check for sudden drop
    if (
      baseline.average - latestConfidence >
      this.anomalyConfig.suddenDropThreshold
    ) {
      this.createAnomaly(entityId, 'sudden_drop', {
        currentConfidence: latestConfidence,
        historicalAverage: baseline.average,
        deviation: baseline.average - latestConfidence,
        dataPointsAnalyzed: recentData.length,
      });
    }

    // Check for consistently low confidence
    const recentAverage =
      recentData.reduce((a, b) => a + b.confidence, 0) / recentData.length;
    if (recentAverage < this.anomalyConfig.lowConfidenceThreshold) {
      this.createAnomaly(entityId, 'consistently_low', {
        currentConfidence: recentAverage,
        historicalAverage: baseline.average,
        deviation: baseline.average - recentAverage,
        dataPointsAnalyzed: recentData.length,
      });
    }

    // Check for high variance
    if (baseline.stdDev > this.anomalyConfig.highVarianceThreshold) {
      this.createAnomaly(entityId, 'high_variance', {
        currentConfidence: latestConfidence,
        historicalAverage: baseline.average,
        deviation: baseline.stdDev,
        dataPointsAnalyzed: recentData.length,
      });
    }
  }

  private createAnomaly(
    entityId: string,
    type: 'sudden_drop' | 'consistently_low' | 'high_variance',
    details: ConfidenceAnomalyAlert['details']
  ): void {
    // Check cooldown
    const alertKey = `${entityId}-${type}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const cooldown = this.anomalyConfig?.alertCooldownMs ?? 5 * 60 * 1000;

    if (lastAlertTime && Date.now() - lastAlertTime < cooldown) {
      return;
    }

    const alert: ConfidenceAnomalyAlert = {
      id: `${entityId}-${type}-${Date.now()}`,
      entityId,
      type,
      severity: this.calculateSeverity(type, details.deviation),
      detectedAt: new Date(),
      details,
    };

    this.anomalyAlerts.set(alert.id, alert);
    this.lastAlertTimes.set(alertKey, Date.now());

    this.logger.warn('Confidence anomaly detected', { alert });
    this.emit('anomaly', alert);
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
    if (!this.anomalyConfig) return;

    this.checkInterval = setInterval(async () => {
      const entities = Array.from(this.entityBaselines.keys());

      for (const entityId of entities) {
        await this.checkForAnomalies(entityId);
      }
    }, this.anomalyConfig.checkIntervalMs);
  }
}
