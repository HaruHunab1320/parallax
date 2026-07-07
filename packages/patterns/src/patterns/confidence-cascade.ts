import { cf } from '@parallaxai/confidence';
import type { PatternModule } from '../types';

/**
 * Converted from patterns/confidence-cascade.prism (v1.0.0) — the 116-line
 * manually-unrolled cascade is a loop now. Walks results in dispatch order
 * and stops at the first one meeting the target confidence; otherwise
 * keeps the best effort seen.
 */
export const confidenceCascade: PatternModule = {
  meta: {
    name: 'ConfidenceCascade',
    version: '2.0.0',
    description: 'Cascade through agents based on confidence thresholds',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          minConfidence: { type: 'number' },
        },
      },
    },
    capabilities: ['query-processing'],
    minAgents: 1,
  },

  async execute(ctx) {
    const targetConfidence: number = ctx.input?.minConfidence ?? 0.8;

    let best: (typeof ctx.results)[number] | null = null;
    let attempts = 0;
    let targetAchieved = false;
    const confidenceProgression: number[] = [];

    for (const result of ctx.results) {
      attempts++;
      confidenceProgression.push(result.confidence);
      if (!best || result.confidence > best.confidence) best = result;
      if (result.confidence >= targetConfidence) {
        targetAchieved = true;
        break;
      }
    }

    const bestConfidence = best?.confidence ?? 0;
    const status = targetAchieved
      ? 'target_achieved'
      : bestConfidence > 0.6
        ? 'best_effort'
        : 'low_confidence';
    const recommendation = targetAchieved
      ? 'Target confidence achieved'
      : bestConfidence > 0.6
        ? 'Consider lowering confidence threshold or adding more agents'
        : 'Manual review recommended';

    return cf(
      {
        status,
        result: best?.result ?? null,
        confidence: bestConfidence,
        attempts,
        targetConfidence,
        selectedAgent: best?.agentName ?? 'none',
        recommendation,
        metadata: {
          targetConfidence,
          agentsAvailable: ctx.agents.length,
          attemptsMade: attempts,
          confidenceProgression,
        },
      },
      bestConfidence
    );
  },
};
