import { cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

const recOf = (r: PatternAgentResult | undefined): unknown =>
  (r?.result as { recommendation?: unknown } | null | undefined)
    ?.recommendation;

/**
 * Converted from patterns/parallel-exploration.prism (v1.0.0) — the manual
 * three-agent counting is a loop now, still sampling at most the first three
 * results as the script did.
 */
export const parallelExploration: PatternModule = {
  meta: {
    name: 'ParallelExploration',
    version: '2.0.0',
    description:
      'Explore multiple approaches when consensus is low but individual confidence is high',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          data: { type: 'any' },
          consensusThreshold: { type: 'number' },
        },
      },
    },
    capabilities: ['code-analysis'],
    minAgents: 3,
  },

  async execute(ctx) {
    const consensusThreshold: number = ctx.input?.consensusThreshold ?? 0.6;
    const highConfidenceThreshold = 0.8;
    const results = ctx.results;

    let highConfidenceCount = 0;
    let totalConfidence = 0;
    const sampled = Math.min(results.length, 3);
    for (let i = 0; i < sampled; i++) {
      const c = results[i]!.confidence;
      totalConfidence += c;
      if (c > highConfidenceThreshold) highConfidenceCount++;
    }

    // As in the script: the sum covers at most the first three results but is
    // divided by the full agent count.
    const avgConfidence =
      results.length > 0 ? totalConfidence / results.length : 0;

    // Consensus check: any two of the first three recommendations agree.
    let hasConsensus = false;
    if (results.length >= 2) {
      const rec1 = recOf(results[0]);
      const rec2 = recOf(results[1]);
      if (rec1 === rec2) hasConsensus = true;
      if (results.length >= 3 && !hasConsensus) {
        const rec3 = recOf(results[2]);
        if (rec1 === rec3 || rec2 === rec3) hasConsensus = true;
      }
    }

    const explorationNeeded = highConfidenceCount >= 2 && !hasConsensus;
    const explorationStrategy = explorationNeeded
      ? 'divergent_exploration'
      : hasConsensus && avgConfidence > consensusThreshold
        ? 'consensus_reached'
        : 'standard_analysis';

    const result = {
      strategy: explorationStrategy,
      explorationNeeded,
      hasConsensus,
      averageConfidence: avgConfidence,
      highConfidenceCount,
      consensusThreshold,
      approaches: results,
      recommendation: explorationNeeded
        ? 'Multiple valid approaches detected - consider all perspectives'
        : hasConsensus
          ? recOf(results[0])
          : 'Low consensus - additional analysis recommended',
      insights: {
        divergentThinking: highConfidenceCount >= 2 && !hasConsensus,
        strongAgreement: hasConsensus && avgConfidence > 0.8,
        uncertaintyPresent: avgConfidence < consensusThreshold,
      },
    };

    // Boost confidence when valuable divergence is found (cf clamps to 1).
    const explorationConfidence = explorationNeeded
      ? avgConfidence * 1.1
      : avgConfidence;

    return cf(result, explorationConfidence);
  },
};
