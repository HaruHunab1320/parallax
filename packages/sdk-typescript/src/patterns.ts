import { 
  Agent, 
  AgentResult, 
  CoordinationPattern,
  ConfidenceProtocol,
  DEFAULT_THRESHOLDS
} from '@parallax/runtime';

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
    const highestConfidence = results.reduce((prev, current) =>
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
        .filter((r) => r.confidence >= DEFAULT_THRESHOLDS.high)
        .map((r) => ({
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
      (r) => r.confidence >= DEFAULT_THRESHOLDS.medium
    );

    if (highConfidenceResults.length === 0) {
      throw new Error('No high confidence results');
    }

    return highConfidenceResults[0].value;
  }
}