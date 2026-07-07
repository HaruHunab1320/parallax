import { cf } from '@parallaxai/confidence';
import type { PatternModule } from '../types';

/** Converted from patterns/consensus-builder.prism (v1.0.0). */
export const consensusBuilder: PatternModule = {
  meta: {
    name: 'ConsensusBuilder',
    version: '2.0.0',
    description: 'Build weighted consensus from pre-processed agent analyses',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          data: { type: 'any' },
        },
      },
    },
    capabilities: ['code-analysis'],
    minAgents: 3,
    minConfidence: 0.6,
  },

  async execute(ctx) {
    const results = ctx.results;
    const successCount = ctx.successfulResults.length;

    // Expertise-weighted consensus confidence.
    const totalWeight = results.reduce((sum, r) => sum + (r.expertise ?? 0), 0);
    const totalWeightedConfidence = results.reduce(
      (sum, r) => sum + r.confidence * (r.expertise ?? 0),
      0
    );
    const consensusConfidence =
      totalWeight > 0 ? totalWeightedConfidence / totalWeight : 0;

    const highConfidenceCount = results.filter(
      (r) => r.confidence > 0.8
    ).length;

    let consensusType: string;
    let message: string;
    if (highConfidenceCount >= 3 && consensusConfidence > 0.8) {
      consensusType = 'strong_consensus';
      message = 'Strong agreement among experts';
    } else if (highConfidenceCount >= 2 && consensusConfidence > 0.6) {
      consensusType = 'moderate_consensus';
      message = 'Moderate agreement with some uncertainty';
    } else {
      consensusType = 'weak_consensus';
      message = 'Limited agreement - consider more analysis';
    }

    // Top recommendation comes from the highest-confidence result; the
    // default only holds when no result beats confidence 0 (as in the
    // original's reduce seed).
    let topResult: { result: unknown; confidence: number } = {
      result: { recommendation: 'No recommendation available' },
      confidence: 0,
    };
    for (const r of results) {
      if (topResult.confidence < r.confidence) topResult = r;
    }
    const recommendation =
      (topResult.result as { recommendation?: string } | null | undefined)
        ?.recommendation ?? 'No recommendation available';

    return cf(
      {
        type: consensusType,
        confidence: consensusConfidence,
        message,
        recommendation,
        agentCount: results.length,
        successfulAgents: successCount,
        highConfidenceAgents: highConfidenceCount,
        results,
      },
      consensusConfidence
    );
  },
};
