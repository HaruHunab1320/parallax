import { cf } from '@parallaxai/confidence';
import type { PatternModule } from '../types';

interface RefinementStep {
  tier: number;
  agentName: string;
  confidence: number;
  duration: 'fast' | 'medium' | 'thorough';
}

const TIER_DURATIONS: RefinementStep['duration'][] = [
  'fast',
  'medium',
  'thorough',
];

/**
 * Converted from patterns/cascading-refinement.prism (v1.0.0) — the three
 * manually-unrolled tiers are a loop now. Results arrive ordered by
 * tier/quality; each tier's result is adopted when it is more confident
 * than what we have, stopping early once the target confidence is reached.
 */
export const cascadingRefinement: PatternModule = {
  meta: {
    name: 'CascadingRefinement',
    version: '2.0.0',
    description:
      'Progressively refine results with increasing cost/quality agents',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          data: { type: 'any' },
          minConfidence: { type: 'number' },
          maxTier: { type: 'number' },
        },
      },
    },
    capabilities: ['code-analysis'],
    minAgents: 3,
  },

  async execute(ctx) {
    const targetConfidence: number = ctx.input?.minConfidence ?? 0.8;
    const maxTier: number = ctx.input?.maxTier ?? 3;

    let result: unknown = null;
    let currentConfidence = 0;
    const refinementPath: RefinementStep[] = [];
    let finalResult: Record<string, unknown> | null = null;

    const tiers = Math.min(3, maxTier, ctx.results.length);
    for (let tier = 1; tier <= tiers; tier++) {
      // Tiers 2/3 only run while the target hasn't been met.
      if (tier > 1 && currentConfidence >= targetConfidence) break;

      const tierResult = ctx.results[tier - 1]!;
      refinementPath.push({
        tier,
        agentName: tierResult.agentName,
        confidence: tierResult.confidence,
        duration: TIER_DURATIONS[tier - 1]!,
      });

      // Tier 1 is adopted unconditionally; later tiers only when more
      // confident (matching the original script).
      if (tier === 1 || tierResult.confidence > currentConfidence) {
        result = tierResult.result;
        currentConfidence = tierResult.confidence;
      }

      // Tiers 1 and 2 report early success; tier 3 falls through to the
      // generic final result, as in the original.
      if (tier < 3 && currentConfidence >= targetConfidence) {
        finalResult = {
          value: result,
          confidence: currentConfidence,
          refinementPath,
          message: `Target confidence achieved with tier ${tier}`,
        };
        break;
      }
    }

    if (!finalResult) {
      finalResult = {
        value: result,
        confidence: currentConfidence,
        refinementPath,
        targetConfidence,
        message:
          currentConfidence >= targetConfidence
            ? 'Target confidence achieved'
            : 'Best effort - target confidence not reached',
      };
    }

    return cf(finalResult, currentConfidence);
  },
};
