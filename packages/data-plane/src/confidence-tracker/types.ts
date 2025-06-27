export interface ConfidenceDataPoint {
  agentId: string;
  pattern: string;
  task: string;
  confidence: number;
  timestamp: Date;
  executionId?: string;
  metadata?: Record<string, any>;
  // Legacy fields for compatibility
  patternName?: string;
  taskType?: string;
}

export interface ConfidenceMetrics {
  agentId: string;
  averageConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  confidenceTrend: 'improving' | 'stable' | 'declining';
  dataPoints: number;
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface ConfidenceQuery {
  agentIds?: string[];
  patternNames?: string[];
  startTime?: Date;
  endTime?: Date;
  minConfidence?: number;
  maxConfidence?: number;
  limit?: number;
}

export interface ConfidenceAnomalyAlert {
  id: string;
  agentId: string;
  type: 'sudden_drop' | 'consistently_low' | 'high_variance';
  severity: 'low' | 'medium' | 'high';
  detectedAt: Date;
  details: {
    currentConfidence: number;
    historicalAverage: number;
    deviation: number;
  };
}

export type AggregationInterval = 'minute' | 'hour' | 'day';

export interface ConfidenceStore {
  addDataPoint(point: ConfidenceDataPoint): Promise<void>;
  getDataPoints(
    agentId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ConfidenceDataPoint[]>;
  getAggregatedData(
    agentId: string,
    interval: AggregationInterval,
    startTime: Date,
    endTime: Date
  ): Promise<{ time: Date; avgConfidence: number; count: number }[]>;
  getPatternStats(
    pattern: string,
    startTime: Date,
    endTime: Date
  ): Promise<{
    avgConfidence: number;
    totalExecutions: number;
    successRate: number;
    agentBreakdown: Map<string, number>;
  }>;
  detectAnomalies(
    agentId: string,
    threshold?: number
  ): Promise<Array<{ time: Date; confidence: number; zscore: number }>>;
  cleanup(retentionPeriod: number): Promise<void>;
}