import { Logger } from 'pino';

/**
 * Standardized agent response format
 */
interface AgentResponse<T = any> {
  value: T;
  confidence: number;
  agent: string;
  reasoning?: string;
  uncertainties?: string[];
  metadata?: {
    timestamp?: number;
    [key: string]: any;
  };
}

/**
 * Agent performance tracking data
 */
interface AgentPerformance {
  agentId: string;
  domain: string;
  totalPredictions: number;
  correctPredictions: number;
  averageConfidence: number;
  actualAccuracy: number;
  calibrationError: number;
  lastUpdated: Date;
}

/**
 * Calibration configuration for different domains
 */
interface CalibrationConfig {
  domain: string;
  minSamples: number;
  decayFactor: number;
  adjustmentRate: number;
}

/**
 * Service for calibrating confidence scores based on historical performance
 */
export class ConfidenceCalibrationService {
  private performanceData = new Map<string, AgentPerformance>();
  private calibrationConfigs = new Map<string, CalibrationConfig>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'ConfidenceCalibration' });
    this.initializeDefaultCalibrations();
  }

  /**
   * Initialize default calibration configurations for common domains
   */
  private initializeDefaultCalibrations() {
    const defaultConfigs: CalibrationConfig[] = [
      {
        domain: 'security',
        minSamples: 10,
        decayFactor: 0.95,
        adjustmentRate: 0.1
      },
      {
        domain: 'performance',
        minSamples: 20,
        decayFactor: 0.9,
        adjustmentRate: 0.15
      },
      {
        domain: 'architecture',
        minSamples: 15,
        decayFactor: 0.93,
        adjustmentRate: 0.12
      },
      {
        domain: 'general',
        minSamples: 30,
        decayFactor: 0.9,
        adjustmentRate: 0.1
      }
    ];

    defaultConfigs.forEach(config => {
      this.calibrationConfigs.set(config.domain, config);
    });
  }

  /**
   * Calibrate a single agent response based on historical performance
   */
  calibrateResponse<T>(response: AgentResponse<T>, domain: string = 'general'): AgentResponse<T> {
    const performanceKey = `${response.agent}-${domain}`;
    const performance = this.performanceData.get(performanceKey);

    if (!performance || performance.totalPredictions < this.getMinSamples(domain)) {
      // Not enough data for calibration
      this.logger.debug({
        agent: response.agent,
        domain,
        samples: performance?.totalPredictions || 0,
        required: this.getMinSamples(domain)
      }, 'Insufficient data for calibration');
      return response;
    }

    // Calculate calibration adjustment
    const calibrationAdjustment = this.calculateAdjustment(
      response.confidence,
      performance
    );

    // Apply calibration
    const calibratedConfidence = Math.max(0, Math.min(1, 
      response.confidence + calibrationAdjustment
    ));

    this.logger.debug({
      agent: response.agent,
      domain,
      original: response.confidence,
      adjusted: calibratedConfidence,
      adjustment: calibrationAdjustment
    }, 'Confidence calibrated');

    return {
      ...response,
      confidence: calibratedConfidence,
      metadata: {
        ...response.metadata,
        calibration: {
          original: response.confidence,
          adjusted: calibratedConfidence,
          domain,
          samples: performance.totalPredictions
        }
      }
    };
  }

  /**
   * Calibrate multiple responses
   */
  calibrateResponses<T>(
    responses: AgentResponse<T>[], 
    domain: string = 'general'
  ): AgentResponse<T>[] {
    return responses.map(response => this.calibrateResponse(response, domain));
  }

  /**
   * Record the outcome of a prediction for future calibration
   */
  async recordOutcome(
    agentId: string,
    domain: string,
    predictedConfidence: number,
    wasCorrect: boolean
  ): Promise<void> {
    const performanceKey = `${agentId}-${domain}`;
    let performance = this.performanceData.get(performanceKey);

    if (!performance) {
      performance = {
        agentId,
        domain,
        totalPredictions: 0,
        correctPredictions: 0,
        averageConfidence: 0,
        actualAccuracy: 0,
        calibrationError: 0,
        lastUpdated: new Date()
      };
    }

    // Update performance metrics
    const config = this.calibrationConfigs.get(domain) || this.calibrationConfigs.get('general')!;
    
    // Apply decay to old predictions
    performance.totalPredictions = performance.totalPredictions * config.decayFactor + 1;
    performance.correctPredictions = performance.correctPredictions * config.decayFactor + (wasCorrect ? 1 : 0);
    
    // Update running averages
    performance.averageConfidence = 
      (performance.averageConfidence * (performance.totalPredictions - 1) + predictedConfidence) / 
      performance.totalPredictions;
    
    performance.actualAccuracy = performance.correctPredictions / performance.totalPredictions;
    performance.calibrationError = performance.averageConfidence - performance.actualAccuracy;
    performance.lastUpdated = new Date();

    this.performanceData.set(performanceKey, performance);

    this.logger.info({
      agentId,
      domain,
      performance: {
        accuracy: performance.actualAccuracy,
        avgConfidence: performance.averageConfidence,
        calibrationError: performance.calibrationError,
        samples: Math.floor(performance.totalPredictions)
      }
    }, 'Performance updated');
  }

  /**
   * Calculate calibration adjustment based on historical performance
   */
  private calculateAdjustment(
    confidence: number,
    performance: AgentPerformance
  ): number {
    const config = this.calibrationConfigs.get(performance.domain) || 
                  this.calibrationConfigs.get('general')!;

    // Base adjustment is the negative of calibration error
    let adjustment = -performance.calibrationError * config.adjustmentRate;

    // Apply confidence-dependent scaling
    // Higher confidences get stronger adjustments
    const confidenceScale = confidence > 0.8 ? 1.2 : 
                          confidence > 0.5 ? 1.0 : 0.8;
    
    adjustment *= confidenceScale;

    // Limit adjustment magnitude
    const maxAdjustment = 0.2;
    adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));

    return adjustment;
  }

  /**
   * Get minimum samples required for calibration
   */
  private getMinSamples(domain: string): number {
    const config = this.calibrationConfigs.get(domain) || 
                  this.calibrationConfigs.get('general')!;
    return config.minSamples;
  }

  /**
   * Get performance statistics for an agent in a domain
   */
  getAgentPerformance(agentId: string, domain: string): AgentPerformance | null {
    return this.performanceData.get(`${agentId}-${domain}`) || null;
  }

  /**
   * Get all performance data for reporting
   */
  getAllPerformanceData(): Map<string, AgentPerformance> {
    return new Map(this.performanceData);
  }

  /**
   * Export calibration data for persistence
   */
  exportCalibrationData(): string {
    const data = {
      performanceData: Array.from(this.performanceData.entries()),
      timestamp: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import calibration data from persistence
   */
  importCalibrationData(jsonData: string): void {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.performanceData && Array.isArray(data.performanceData)) {
        this.performanceData.clear();
        data.performanceData.forEach(([key, value]: [string, AgentPerformance]) => {
          value.lastUpdated = new Date(value.lastUpdated);
          this.performanceData.set(key, value);
        });
        
        this.logger.info({
          imported: this.performanceData.size,
          timestamp: data.timestamp
        }, 'Calibration data imported');
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to import calibration data');
      throw error;
    }
  }

  /**
   * Reset calibration data for an agent or domain
   */
  resetCalibration(agentId?: string, domain?: string): void {
    if (agentId && domain) {
      this.performanceData.delete(`${agentId}-${domain}`);
    } else if (agentId) {
      // Reset all domains for an agent
      Array.from(this.performanceData.keys())
        .filter(key => key.startsWith(`${agentId}-`))
        .forEach(key => this.performanceData.delete(key));
    } else if (domain) {
      // Reset all agents for a domain
      Array.from(this.performanceData.keys())
        .filter(key => key.endsWith(`-${domain}`))
        .forEach(key => this.performanceData.delete(key));
    } else {
      // Reset everything
      this.performanceData.clear();
    }
    
    this.logger.info({ agentId, domain }, 'Calibration data reset');
  }
}