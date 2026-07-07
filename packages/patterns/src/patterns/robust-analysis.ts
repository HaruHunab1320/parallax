import { cf } from '@parallaxai/confidence';
import type { PatternModule } from '../types';

/** Converted from patterns/robust-analysis.prism (v1.0.0). */
export const robustAnalysis: PatternModule = {
  meta: {
    name: 'RobustAnalysis',
    version: '2.0.0',
    description:
      'Composite pattern that uses load balancing, consensus building, and uncertainty routing',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          data: { type: 'any' },
          requirements: { type: 'object' },
        },
      },
    },
    capabilities: ['code-analysis'],
    minAgents: 4,
  },

  async execute(ctx) {
    const analysisResults = ctx.results;
    const agentCount = analysisResults.length;

    const totalConfidence = analysisResults.reduce(
      (sum, r) => sum + r.confidence,
      0
    );
    const highConfidenceCount = analysisResults.filter(
      (r) => r.confidence > 0.8
    ).length;
    const lowConfidenceCount = analysisResults.filter(
      (r) => r.confidence < 0.5
    ).length;

    const avgConfidence = agentCount > 0 ? totalConfidence / agentCount : 0;

    // Determine robustness level
    let robustnessLevel: string;
    let strategy: string;
    if (highConfidenceCount >= 3 && avgConfidence > 0.75) {
      robustnessLevel = 'highly_robust';
      strategy = 'consensus_based';
    } else if (highConfidenceCount >= 2 && lowConfidenceCount === 0) {
      robustnessLevel = 'moderately_robust';
      strategy = 'majority_based';
    } else if (lowConfidenceCount >= 2) {
      robustnessLevel = 'low_robustness';
      strategy = 'uncertainty_aware';
    } else {
      robustnessLevel = 'mixed_robustness';
      strategy = 'balanced_approach';
    }

    // Select the highest-confidence result
    const bestResult = analysisResults.reduce<
      (typeof analysisResults)[number] | null
    >(
      (best, current) =>
        !best || current.confidence > best.confidence ? current : best,
      null
    );

    const bestValue = (bestResult?.result ?? null) as {
      recommendation?: unknown;
    } | null;

    const result = {
      robustnessLevel,
      strategy,
      averageConfidence: avgConfidence,
      highConfidenceCount,
      lowConfidenceCount,
      totalAgents: agentCount,
      selectedResult: bestResult?.result ?? null,
      recommendation:
        bestValue?.recommendation ?? 'Insufficient data for robust analysis',
      analysisInsights: {
        consensusStrength:
          highConfidenceCount >= 3
            ? 'strong'
            : highConfidenceCount >= 2
              ? 'moderate'
              : 'weak',
        uncertaintyLevel:
          lowConfidenceCount >= 2
            ? 'high'
            : lowConfidenceCount >= 1
              ? 'moderate'
              : 'low',
        reliabilityScore: avgConfidence,
      },
      allResults: analysisResults,
    };

    // Robustness-adjusted confidence (cf clamps to [0, 1])
    const robustConfidence =
      strategy === 'consensus_based' ? avgConfidence * 1.1 : avgConfidence;

    return cf(result, robustConfidence);
  },
};
