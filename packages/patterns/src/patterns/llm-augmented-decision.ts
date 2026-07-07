import { cf, majorityVote, synthesize, uncertain, val } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

interface DecisionOutcome {
  decision: unknown;
  reasoning: string;
  augmented: boolean;
}

/** Most confident agent answer, or null when there are none. */
function synthesizeResults(results: PatternAgentResult[]): unknown {
  if (results.length === 0) return null;
  return val(synthesize(results.map((r) => cf(r.result, r.confidence))));
}

/**
 * Consensus from confidence variance: lower variance = higher consensus
 * (scale factor 2, floored at 0.1).
 */
function calculateConsensus(results: PatternAgentResult[]): number {
  if (results.length === 0) return 0;
  if (results.length === 1) return results[0]!.confidence;

  const confidences = results.map((r) => r.confidence);
  const avg = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  const variance =
    confidences.reduce((sum, c) => sum + (c - avg) * (c - avg), 0) /
    confidences.length;

  const consensusScore = 1.0 - variance * 2;
  return consensusScore > 0 ? consensusScore : 0.1;
}

/** The Prism script's getDecisionKey: decision, else recommendation, else "default". */
function decisionKey(value: unknown): string {
  const v = value as
    | { decision?: unknown; recommendation?: unknown }
    | null
    | undefined;
  if (v && typeof v === 'object') {
    if (v.decision) return String(v.decision);
    if (v.recommendation) return String(v.recommendation);
  }
  return 'default';
}

function hasBlockingConcern(r: PatternAgentResult): boolean {
  const answer = r.result as
    | { severity?: unknown; risk?: unknown; recommendation?: unknown }
    | null
    | undefined;
  if (!answer || typeof answer !== 'object') return false;
  return (
    answer.severity === 'critical' ||
    answer.risk === 'high' ||
    answer.recommendation === 'block'
  );
}

/** Low-consensus fallback: block on any critical concern, else proceed cautiously. */
function conservativeDecision(results: PatternAgentResult[]): unknown {
  for (const r of results) {
    if (hasBlockingConcern(r)) {
      return {
        action: 'block',
        reason: 'Critical concerns identified',
        concern: r,
      };
    }
  }
  return {
    action: 'proceed-with-caution',
    reason: 'No critical blockers but low consensus',
    recommendation: synthesizeResults(results),
  };
}

// NOTE: original pattern called llm(...) here (via its mockLLMAnalysis stub) —
// not available in pattern modules; the script's own mock analysis is
// preserved so the output shape and semantics are unchanged.
function mockLLMAnalysis(results: PatternAgentResult[]): {
  recommendation: string;
  confidence: number;
  keyInsights: string[];
  synthesis: unknown;
} {
  return {
    recommendation: 'Based on analysis, proceed with caution',
    confidence: 0.8,
    keyInsights: [
      'Agents show divergent opinions',
      'Security concerns noted by multiple agents',
      'Performance implications need consideration',
    ],
    synthesis: synthesizeResults(results),
  };
}

/** Converted from patterns/llm-augmented-decision.prism. */
export const llmAugmentedDecision: PatternModule = {
  meta: {
    name: 'LLMAugmentedDecision',
    version: '2.0.0',
    description:
      'Augments agent decisions with LLM meta-analysis when consensus is low',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          useLLM: { type: 'boolean' },
          llmThreshold: { type: 'number' },
        },
      },
    },
    minAgents: 1,
    metadata: { requiresLlm: true },
  },

  async execute(ctx) {
    const llmEnabled: boolean = ctx.input?.useLLM ?? false;
    const llmThreshold: number = ctx.input?.llmThreshold ?? 0.6;
    const results = ctx.results;

    const consensusScore = calculateConsensus(results);
    const needsLLM = llmEnabled && consensusScore < llmThreshold;

    const branch = uncertain<PatternAgentResult[], DecisionOutcome>(
      cf(results, consensusScore),
      {
        high: (rs) => ({
          decision: synthesizeResults(rs),
          reasoning: 'High consensus among agents',
          augmented: false,
        }),
        medium: (rs) => {
          if (needsLLM) {
            return {
              decision: mockLLMAnalysis(rs).recommendation,
              reasoning: 'Medium consensus augmented with LLM analysis',
              augmented: true,
            };
          }
          // The script's weightedVote/findBestVote was a stub ("return first
          // result"); the library's majorityVote implements the intended
          // confidence-weighted grouping by decision key.
          return {
            decision: val(
              majorityVote(
                rs.map((r) => cf(r.result, r.confidence)),
                decisionKey
              )
            ),
            reasoning: 'Medium consensus using weighted voting',
            augmented: false,
          };
        },
        low: (rs) => {
          if (needsLLM) {
            return {
              decision: mockLLMAnalysis(rs).recommendation,
              reasoning: 'Low consensus resolved through LLM meta-analysis',
              augmented: true,
            };
          }
          return {
            decision: conservativeDecision(rs),
            reasoning: 'Low consensus - taking conservative approach',
            augmented: false,
          };
        },
      }
    );

    const { decision, reasoning, augmented } = val(branch);
    const confidence = augmented ? 0.8 : consensusScore;

    return cf(
      {
        decision,
        confidence,
        reasoning,
        consensus: consensusScore,
        augmented,
        agentCount: results.length,
        metadata: {
          pattern: 'LLMAugmentedDecision',
          llmEnabled,
          threshold: llmThreshold,
        },
      },
      confidence
    );
  },
};
