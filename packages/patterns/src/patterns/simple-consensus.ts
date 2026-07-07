import { averageConfidence, cf } from '@parallaxai/confidence';
import type { PatternModule } from '../types';

/** Converted from patterns/simple-consensus.prism (v1.0.0). */
export const simpleConsensus: PatternModule = {
  meta: {
    name: 'SimpleConsensus',
    version: '2.0.0',
    description: 'Simple consensus pattern using pre-processed results',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: { task: { type: 'string' } },
      },
    },
    minAgents: 2,
  },

  async execute(ctx) {
    const avg = averageConfidence(
      ctx.results.map((r) => cf(r.result, r.confidence))
    );

    return cf(
      {
        status: avg > 0.7 ? 'consensus_reached' : 'low_consensus',
        confidence: avg,
        agentCount: ctx.results.length,
        agents: ctx.results.map((r) => ({
          name: r.agentName,
          confidence: r.confidence,
          result: r.result,
        })),
      },
      avg
    );
  },
};
