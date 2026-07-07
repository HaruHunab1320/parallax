import { averageConfidence, cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

interface PromptVariantData {
  variantType?: string;
  response?: string;
  latencyMs?: number;
  responseLength?: number;
  evaluations?: unknown[];
  winner?: string;
  winnerReason?: string;
  recommendation?: string;
}

const dataOf = (r: PatternAgentResult): PromptVariantData =>
  (r.result ?? {}) as PromptVariantData;

/** The Prism script's `reduce((acc, r) => r, null)` — the last element, or null. */
const lastOf = (rs: PatternAgentResult[]): PatternAgentResult | null =>
  rs.length > 0 ? rs[rs.length - 1]! : null;

/** Converted from patterns/prompt-testing.prism (v1.0.0). */
export const promptTesting: PatternModule = {
  meta: {
    name: 'PromptTesting',
    version: '2.0.0',
    description:
      'A/B test different prompt styles and evaluate which performs best',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
      },
    },
    capabilities: ['prompt', 'testing'],
    minAgents: 2,
  },

  async execute(ctx) {
    const validResults = ctx.results.filter(
      (r) => r.confidence > 0 && r.result
    );

    const variantResults = validResults.filter(
      (r) => dataOf(r).variantType !== 'judge'
    );
    const judgeCheck = lastOf(
      validResults.filter((r) => dataOf(r).variantType === 'judge')
    );

    const variantOf = (type: string) =>
      lastOf(variantResults.filter((r) => dataOf(r).variantType === type));

    const variantBlock = (check: PatternAgentResult | null) => ({
      response: check ? (dataOf(check).response ?? '') : '',
      latencyMs: check ? (dataOf(check).latencyMs ?? 0) : 0,
      length: check ? (dataOf(check).responseLength ?? 0) : 0,
    });

    const judge = judgeCheck ? dataOf(judgeCheck) : null;

    const avgConfidence = averageConfidence(
      validResults.map((r) => cf(r.result, r.confidence))
    );

    const variantDetails = variantResults.map((r) => ({
      style: dataOf(r).variantType,
      agent: r.agentName,
      responseLength: dataOf(r).responseLength,
      latencyMs: dataOf(r).latencyMs,
      confidence: r.confidence,
    }));

    return cf(
      {
        query: ctx.input?.data?.query,
        variants: {
          concise: variantBlock(variantOf('concise')),
          detailed: variantBlock(variantOf('detailed')),
          creative: variantBlock(variantOf('creative')),
        },
        evaluation: {
          evaluations: judge?.evaluations ?? [],
          winner: judge ? (judge.winner ?? 'unknown') : 'unknown',
          winnerReason: judge?.winnerReason ?? '',
          recommendation: judge?.recommendation ?? '',
        },
        metadata: {
          variantsTested: variantResults.length,
          averageConfidence: avgConfidence,
          variantDetails,
          patternVersion: '2.0.0',
        },
      },
      avgConfidence
    );
  },
};
