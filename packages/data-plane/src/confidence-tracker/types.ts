export interface ConfidenceDataPoint {
  agentId: string;
  patternName?: string;
  taskType?: string;
  confidence: number;
  timestamp: Date;
  executionId?: string;
  metadata?: Record<string, any>;
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