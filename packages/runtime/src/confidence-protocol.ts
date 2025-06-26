import { AgentResult, ConfidenceLevel, ConfidenceThresholds } from './types';

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  high: 0.8,
  medium: 0.5,
  low: 0.0,
};

export class ConfidenceProtocol {
  constructor(private thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS) {}

  getConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= this.thresholds.high) return 'high';
    if (confidence >= this.thresholds.medium) return 'medium';
    return 'low';
  }

  calculateWeightedConsensus<T>(results: AgentResult<T>[]): {
    consensus: number;
    weightedValue?: T;
    disagreements: Array<{ agent1: string; agent2: string; difference: number }>;
  } {
    if (results.length === 0) {
      return { consensus: 0, disagreements: [] };
    }

    const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence = totalConfidence / results.length;

    // Find disagreements
    const disagreements: Array<{ agent1: string; agent2: string; difference: number }> = [];
    
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const result1 = results[i];
        const result2 = results[j];
        
        // High confidence disagreement detection
        if (result1.confidence >= this.thresholds.high && 
            result2.confidence >= this.thresholds.high) {
          // Compare values (simplified - in practice would need deep comparison)
          if (JSON.stringify(result1.value) !== JSON.stringify(result2.value)) {
            disagreements.push({
              agent1: result1.agent,
              agent2: result2.agent,
              difference: Math.abs(result1.confidence - result2.confidence),
            });
          }
        }
      }
    }

    return {
      consensus: averageConfidence,
      disagreements,
    };
  }

  shouldExploreParallel(results: AgentResult[]): boolean {
    const { consensus, disagreements } = this.calculateWeightedConsensus(results);
    
    // Low consensus with high individual confidence suggests parallel exploration
    const hasHighConfidenceResults = results.some(
      (r) => r.confidence >= this.thresholds.high
    );
    
    return consensus < this.thresholds.medium && 
           hasHighConfidenceResults && 
           disagreements.length > 0;
  }
}