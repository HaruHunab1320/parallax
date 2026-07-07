import { cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

/**
 * Converted from patterns/load-balancer.prism (v1.0.0) — the manually
 * unrolled four-agent scan is a loop now. Non-confidence strategies use the
 * script's fixed positional scores (0.7, 0.65, 0.6, 0.55), so at most the
 * first four results are considered, as before.
 */
export const loadBalancer: PatternModule = {
  meta: {
    name: 'LoadBalancer',
    version: '2.0.0',
    description:
      'Route requests to the best available agent based on confidence and performance',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          data: { type: 'any' },
          strategy: {
            type: 'string',
            enum: ['confidence', 'latency', 'availability', 'weighted'],
          },
        },
      },
    },
    capabilities: ['any'],
    minAgents: 1,
  },

  async execute(ctx) {
    const strategy: string = ctx.input?.strategy ?? 'weighted';
    const positionalScores = [0.7, 0.65, 0.6, 0.55];

    let bestAgent: string | null = null;
    let bestScore = 0;
    let bestResult: PatternAgentResult | null = null;

    const considered = Math.min(ctx.results.length, positionalScores.length);
    for (let i = 0; i < considered; i++) {
      const agent = ctx.results[i]!;
      const score =
        strategy === 'confidence' ? agent.confidence : positionalScores[i]!;
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent.agentName;
        bestResult = agent;
      }
    }

    return cf(
      {
        value: bestResult ? bestResult.result : null,
        confidence: bestScore,
        routing: {
          selectedAgent: bestAgent,
          strategy,
          score: bestScore,
          agentsConsidered: ctx.results.length,
        },
      },
      bestScore
    );
  },
};
