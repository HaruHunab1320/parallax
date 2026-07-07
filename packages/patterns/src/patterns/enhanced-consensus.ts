import {
  averageConfidence,
  cf,
  conf,
  majorityVote,
  synthesize,
  uncertain,
  val,
  type Confident,
} from '@parallaxai/confidence';
import type { PatternModule } from '../types';

/**
 * Agreement check between two result payloads (the original's
 * `resultsAgree` + `similarValues`). Loose on purpose: two payloads that
 * both lack a `recommendation`/`decision` field count as agreeing, as in
 * the Prism version.
 */
function resultsAgree(a: unknown, b: unknown): boolean {
  const ra = (a ?? {}) as Record<string, unknown>;
  const rb = (b ?? {}) as Record<string, unknown>;
  return (
    ra.recommendation === rb.recommendation ||
    ra.decision === rb.decision ||
    ra.value === rb.value
  );
}

/**
 * Pairwise agreement ratio across result payloads. A single result's
 * consensus is its own confidence; no results is zero consensus.
 */
function calculateConsensus(items: Array<Confident<unknown>>): number {
  if (items.length === 0) return 0;
  if (items.length === 1) return conf(items[0]!);

  let agreements = 0;
  let comparisons = 0;
  for (let i = 0; i < items.length - 1; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (resultsAgree(val(items[i]!), val(items[j]!))) agreements++;
      comparisons++;
    }
  }
  return agreements / comparisons;
}

function explainDecision(method: string, agentCount: number): string {
  if (method === 'weighted-consensus') {
    return 'High consensus among agents enabled weighted combination of results';
  }
  if (method === 'filtered-majority') {
    return 'Medium consensus - used majority vote among high-confidence results';
  }
  return `Low consensus required synthesis across ${agentCount} different agent opinions`;
}

/**
 * Converted from patterns/enhanced-consensus.prism — consensus with
 * confidence extraction and band-dispatched synthesis strategy.
 *
 * The original read pre-computed results from `input.results`; pattern
 * modules receive them from the engine as `ctx.results`. The original's
 * `uncertain if` was banded on the consensus score itself (its `~> 0.9`
 * annotation would otherwise force the high branch every time), which is
 * what this version does.
 */
export const enhancedConsensus: PatternModule = {
  meta: {
    name: 'EnhancedConsensus',
    version: '2.0.0',
    description:
      'Enhanced consensus using confidence extraction, agreement measurement, and band-dispatched synthesis',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          domain: { type: 'string' },
          minConsensus: { type: 'number' },
        },
      },
    },
    minAgents: 2,
  },

  async execute(ctx) {
    const items = ctx.results.map((r) => cf(r.result, r.confidence));
    const confidences = items.map((i) => conf(i));

    const avgConfidence = averageConfidence(items);
    const minConfidence = confidences.reduce((m, c) => (c < m ? c : m), 1.0);
    const maxConfidence = confidences.reduce((m, c) => (c > m ? c : m), 0.0);

    const consensusScore = calculateConsensus(items);

    let decision: unknown;
    let method: string;
    if (items.length === 0) {
      decision = undefined;
      method = 'synthesis';
    } else {
      const banded = uncertain(cf(consensusScore, consensusScore), {
        high: () => {
          // High consensus — weighted combine (highest-confidence result).
          const top = synthesize(items);
          return { decision: top.value ?? top, method: 'weighted-consensus' };
        },
        medium: () => {
          // Medium consensus — majority vote among high-confidence results.
          const highConf = items.filter((i) => conf(i) > 0.7);
          return {
            decision:
              highConf.length > 0
                ? val(majorityVote(highConf))
                : val(synthesize(items)),
            method: 'filtered-majority',
          };
        },
        low: () => ({
          // Low consensus — plain synthesis.
          decision: val(synthesize(items)),
          method: 'synthesis',
        }),
      });
      decision = banded.value.decision;
      method = banded.value.method;
    }

    return cf(
      {
        decision,
        confidence: consensusScore,
        method,
        metrics: {
          avgConfidence,
          minConfidence,
          maxConfidence,
          consensus: consensusScore,
          agentCount: items.length,
        },
        reasoning: explainDecision(method, items.length),
      },
      consensusScore
    );
  },
};
