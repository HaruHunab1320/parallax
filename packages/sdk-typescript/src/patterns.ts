// Temporarily define types here until runtime package is fixed
export interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  analyze<T>(task: string, data?: any): Promise<AgentResult<T>>;
  isAvailable(): Promise<boolean>;
}

export interface AgentResult<T> {
  value: T;
  confidence: number;
  agent: string;
  reasoning?: string;
  uncertainties?: string[];
  timestamp: number;
}

export interface CoordinationPattern {
  name: string;
  description: string;
  execute<T>(agents: Agent[], task: string, data?: any): Promise<T>;
}

export const DEFAULT_THRESHOLDS = {
  high: 0.8,
  medium: 0.6,
  low: 0.4
};

export class ConfidenceProtocol {
  shouldExploreParallel(results: AgentResult<any>[]): boolean {
    const highConfidenceResults = results.filter(r => r.confidence >= DEFAULT_THRESHOLDS.high);
    if (highConfidenceResults.length < 2) return false;
    
    // Check for disagreements
    const values = highConfidenceResults.map(r => JSON.stringify(r.value));
    const uniqueValues = new Set(values);
    return uniqueValues.size > 1;
  }
  
  calculateWeightedConsensus(results: AgentResult<any>[]): { consensus: number; disagreements: string[] } {
    const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
    const consensus = totalConfidence / results.length;
    
    const values = results.map(r => JSON.stringify(r.value));
    const uniqueValues = new Set(values);
    const disagreements = uniqueValues.size > 1 ? Array.from(uniqueValues) : [];
    
    return { consensus, disagreements };
  }
}

export class EpistemicOrchestrator implements CoordinationPattern {
  name = 'epistemic-orchestrator';
  description = 'Multiple agents analyze from different perspectives, high-confidence disagreements trigger parallel paths';
  
  private protocol = new ConfidenceProtocol();

  async execute<T>(agents: Agent[], task: string, data?: any): Promise<T> {
    // Get all agent analyses
    const results = await Promise.all(
      agents.map((agent) => agent.analyze<T>(task, data))
    );

    // Check for high-confidence disagreements
    const shouldExplore = this.protocol.shouldExploreParallel(results);
    
    if (shouldExplore) {
      // Return parallel exploration recommendation
      return this.createParallelRecommendation(results) as T;
    }

    // Return highest confidence result
    const highestConfidence = results.reduce((prev: AgentResult<T>, current: AgentResult<T>) =>
      prev.confidence > current.confidence ? prev : current
    );

    return highestConfidence.value;
  }

  private createParallelRecommendation<T>(results: AgentResult<T>[]) {
    const { consensus, disagreements } = this.protocol.calculateWeightedConsensus(results);
    
    return {
      type: 'parallel-exploration',
      consensus,
      paths: results
        .filter((r: AgentResult<T>) => r.confidence >= DEFAULT_THRESHOLDS.high)
        .map((r: AgentResult<T>) => ({
          agent: r.agent,
          value: r.value,
          confidence: r.confidence,
          reasoning: r.reasoning,
        })),
      disagreements,
      recommendation: 'High-confidence disagreements detected. Consider exploring parallel paths.',
    };
  }
}

export class ConsensusBuilder implements CoordinationPattern {
  name = 'consensus-builder';
  description = 'Build weighted consensus from multiple agents';
  
  private protocol = new ConfidenceProtocol();

  async execute<T>(agents: Agent[], task: string, data?: any): Promise<T> {
    const results = await Promise.all(
      agents.map((agent) => agent.analyze<T>(task, data))
    );

    const { consensus } = this.protocol.calculateWeightedConsensus(results);
    
    if (consensus < DEFAULT_THRESHOLDS.medium) {
      throw new Error('Low consensus - human review recommended');
    }

    // Return weighted average (simplified for demo)
    const highConfidenceResults = results.filter(
      (r: AgentResult<T>) => r.confidence >= DEFAULT_THRESHOLDS.medium
    );

    if (highConfidenceResults.length === 0) {
      throw new Error('No high confidence results');
    }

    return highConfidenceResults[0].value;
  }
}