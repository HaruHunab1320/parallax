import { cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

interface QualityCheckData {
  checkType?: string;
  passed?: boolean;
  score?: number;
  hallucinations?: unknown[];
  offTopicContent?: unknown[];
  missingParts?: unknown[];
}

const dataOf = (r: PatternAgentResult): QualityCheckData =>
  (r.result ?? {}) as QualityCheckData;

/** The Prism script's `reduce((acc, r) => r, null)` — the last element, or null. */
const lastOf = (rs: PatternAgentResult[]): PatternAgentResult | null =>
  rs.length > 0 ? rs[rs.length - 1]! : null;

/** Converted from patterns/quality-gate.prism (v1.0.0). */
export const qualityGate: PatternModule = {
  meta: {
    name: 'RAGQualityGate',
    version: '2.0.0',
    description:
      'Validates RAG responses for groundedness, relevance, and completeness',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
          sources: { type: 'array' },
        },
      },
    },
    capabilities: ['quality-gate', 'verification'],
    minAgents: 2,
  },

  async execute(ctx) {
    const validResults = ctx.results.filter(
      (r) => r.confidence > 0 && r.result
    );

    const checkOf = (type: string) =>
      lastOf(validResults.filter((r) => dataOf(r).checkType === type));

    const groundednessCheck = checkOf('groundedness');
    const relevanceCheck = checkOf('relevance');
    const completenessCheck = checkOf('completeness');

    const groundednessPassed = groundednessCheck
      ? dataOf(groundednessCheck).passed === true
      : false;
    const relevancePassed = relevanceCheck
      ? dataOf(relevanceCheck).passed === true
      : false;
    const completenessPassed = completenessCheck
      ? dataOf(completenessCheck).passed === true
      : false;

    const groundednessScore = groundednessCheck
      ? (dataOf(groundednessCheck).score ?? 0)
      : 0;
    const relevanceScore = relevanceCheck
      ? (dataOf(relevanceCheck).score ?? 0)
      : 0;
    const completenessScore = completenessCheck
      ? (dataOf(completenessCheck).score ?? 0)
      : 0;

    const allPassed =
      groundednessPassed && relevancePassed && completenessPassed;

    const totalChecks = validResults.length;
    const passedChecks = validResults.filter((r) => dataOf(r).passed).length;
    const failedChecks = totalChecks - passedChecks;

    // As in the script: sum of the three named scores, divided by 3 whenever
    // any check ran.
    const scoreSum = groundednessScore + relevanceScore + completenessScore;
    const avgScore = totalChecks > 0 ? scoreSum / 3 : 0;

    const status = allPassed
      ? 'approved'
      : failedChecks === totalChecks
        ? 'rejected'
        : 'needs_review';

    const summary = allPassed
      ? 'All quality checks passed - answer is grounded, relevant, and complete'
      : `${failedChecks} of ${totalChecks} checks failed - ${status}`;

    const checkDetails = validResults.map((r) => ({
      checkType: dataOf(r).checkType,
      agent: r.agentName,
      passed: dataOf(r).passed,
      score: dataOf(r).score,
      reasoning: r.reasoning,
    }));

    return cf(
      {
        status,
        approved: allPassed,
        scores: {
          overall: avgScore,
          groundedness: groundednessScore,
          relevance: relevanceScore,
          completeness: completenessScore,
        },
        checks: {
          total: totalChecks,
          passed: passedChecks,
          failed: failedChecks,
          groundedness: {
            passed: groundednessPassed,
            score: groundednessScore,
            hallucinations: groundednessCheck
              ? (dataOf(groundednessCheck).hallucinations ?? [])
              : [],
          },
          relevance: {
            passed: relevancePassed,
            score: relevanceScore,
            offTopicContent: relevanceCheck
              ? (dataOf(relevanceCheck).offTopicContent ?? [])
              : [],
          },
          completeness: {
            passed: completenessPassed,
            score: completenessScore,
            missingParts: completenessCheck
              ? (dataOf(completenessCheck).missingParts ?? [])
              : [],
          },
        },
        summary,
        details: checkDetails,
        recommendation: allPassed
          ? 'Return answer to user'
          : status === 'needs_review'
            ? 'Flag for human review'
            : 'Regenerate answer with improved retrieval',
        metadata: {
          patternVersion: '2.0.0',
        },
      },
      avgScore
    );
  },
};
