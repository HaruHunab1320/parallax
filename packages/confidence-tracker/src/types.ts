/**
 * A single confidence data point
 */
export interface ConfidenceDataPoint {
  /** Unique identifier for the entity being tracked (e.g., agent ID, model ID) */
  entityId: string;

  /** Category or type of task (e.g., 'code-review', 'classification') */
  category: string;

  /** Specific task identifier */
  task: string;

  /** Confidence score from 0 to 1 */
  confidence: number;

  /** When this score was recorded */
  timestamp: Date;

  /** Optional correlation ID for linking related data points */
  correlationId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated confidence metrics for an entity
 */
export interface ConfidenceMetrics {
  /** Entity identifier */
  entityId: string;

  /** Average confidence score */
  averageConfidence: number;

  /** Minimum confidence score */
  minConfidence: number;

  /** Maximum confidence score */
  maxConfidence: number;

  /** Confidence trend direction */
  confidenceTrend: 'improving' | 'stable' | 'declining';

  /** Number of data points analyzed */
  dataPoints: number;

  /** Time range of the analysis */
  timeRange: {
    start: Date;
    end: Date;
  };
}

/**
 * Query parameters for filtering confidence data
 */
export interface ConfidenceQuery {
  /** Filter by entity IDs */
  entityIds?: string[];

  /** Filter by categories */
  categories?: string[];

  /** Start of time range */
  startTime?: Date;

  /** End of time range */
  endTime?: Date;

  /** Minimum confidence threshold */
  minConfidence?: number;

  /** Maximum confidence threshold */
  maxConfidence?: number;

  /** Maximum number of results */
  limit?: number;
}

/**
 * An anomaly alert triggered by the confidence tracker
 */
export interface ConfidenceAnomalyAlert {
  /** Unique alert identifier */
  id: string;

  /** Entity that triggered the alert */
  entityId: string;

  /** Type of anomaly detected */
  type: 'sudden_drop' | 'consistently_low' | 'high_variance';

  /** Severity level */
  severity: 'low' | 'medium' | 'high';

  /** When the anomaly was detected */
  detectedAt: Date;

  /** Details about the anomaly */
  details: {
    currentConfidence: number;
    historicalAverage: number;
    deviation: number;
    dataPointsAnalyzed?: number;
  };

  /** Whether this alert has been acknowledged */
  acknowledged?: boolean;
}

/**
 * Aggregation interval for time-series data
 */
export type AggregationInterval = 'minute' | 'hour' | 'day';

/**
 * Aggregated time-series data point
 */
export interface AggregatedDataPoint {
  /** Time bucket */
  time: Date;

  /** Average confidence in this bucket */
  avgConfidence: number;

  /** Number of data points in this bucket */
  count: number;
}

/**
 * Interface for confidence data storage backends
 */
export interface ConfidenceStore {
  /** Add a data point to the store */
  addDataPoint(point: ConfidenceDataPoint): Promise<void>;

  /** Get data points for an entity within a time range */
  getDataPoints(
    entityId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ConfidenceDataPoint[]>;

  /** Get aggregated data for an entity */
  getAggregatedData(
    entityId: string,
    interval: AggregationInterval,
    startTime: Date,
    endTime: Date
  ): Promise<AggregatedDataPoint[]>;

  /** Get statistics for a category */
  getCategoryStats(
    category: string,
    startTime: Date,
    endTime: Date
  ): Promise<{
    avgConfidence: number;
    totalExecutions: number;
    successRate: number;
    entityBreakdown: Map<string, number>;
  }>;

  /** Detect anomalies using z-score */
  detectAnomalies(
    entityId: string,
    threshold?: number
  ): Promise<Array<{ time: Date; confidence: number; zscore: number }>>;

  /** Clean up old data */
  cleanup(retentionPeriodDays: number): Promise<void>;

  /** Clear all data (for testing) */
  clear(): Promise<void>;
}

/**
 * Configuration for anomaly detection
 */
export interface AnomalyDetectionConfig {
  /** Enable anomaly detection */
  enabled: boolean;

  /** Threshold for sudden drop detection (0-1, e.g., 0.3 = 30% drop) */
  suddenDropThreshold: number;

  /** Threshold for low confidence alerts (0-1) */
  lowConfidenceThreshold: number;

  /** Threshold for high variance alerts (0-1) */
  highVarianceThreshold: number;

  /** Interval between anomaly checks in milliseconds */
  checkIntervalMs: number;

  /** Minimum data points required before anomaly detection */
  minDataPoints?: number;

  /** Alert cooldown period in milliseconds (prevent duplicate alerts) */
  alertCooldownMs?: number;
}

/**
 * Configuration for the confidence tracker
 */
export interface ConfidenceTrackerConfig {
  /** Storage backend to use */
  store: ConfidenceStore;

  /** Anomaly detection configuration */
  anomalyDetection?: AnomalyDetectionConfig;

  /** Optional logger */
  logger?: Logger;
}

/**
 * Simple logger interface
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Events emitted by the confidence tracker
 */
export interface ConfidenceTrackerEvents {
  'recorded': ConfidenceDataPoint;
  'anomaly': ConfidenceAnomalyAlert;
  'anomaly:resolved': { alertId: string; entityId: string };
  'metrics:updated': { entityId: string; metrics: ConfidenceMetrics };
}
