import { averageConfidence, cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

interface ReviewFinding {
  severity?: string;
  [key: string]: unknown;
}

function findingsOf(r: PatternAgentResult): ReviewFinding[] {
  const result = r.result as { findings?: unknown } | null | undefined;
  return result && Array.isArray(result.findings)
    ? (result.findings as ReviewFinding[])
    : [];
}

/** Converted from patterns/code-review.prism (v1.0.0). */
export const codeReview: PatternModule = {
  meta: {
    name: 'CodeReviewOrchestrator',
    version: '2.0.0',
    description:
      'Orchestrates multi-agent code review with confidence-aware decision making',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          context: { type: 'object' },
        },
      },
    },
    capabilities: ['security', 'style', 'documentation', 'testing'],
    minAgents: 2,
  },

  async execute(ctx) {
    const validResults = ctx.successfulResults;
    const avgConfidence = averageConfidence(
      validResults.map((r) => cf(r.result, r.confidence))
    );

    // Count findings by severity across all agents.
    const countBySeverity = (severity: string): number =>
      validResults.reduce(
        (sum, r) =>
          sum + findingsOf(r).filter((f) => f.severity === severity).length,
        0
      );

    const criticalCount = countBySeverity('critical');
    const highCount = countBySeverity('high');
    const mediumCount = countBySeverity('medium');
    const lowCount = countBySeverity('low');
    const findingCount = criticalCount + highCount + mediumCount + lowCount;

    const hasCritical = criticalCount > 0;
    const hasHigh = highCount > 0;
    const hasMedium = mediumCount > 0;

    const overallSeverity = hasCritical
      ? 'critical'
      : hasHigh
        ? 'high'
        : hasMedium
          ? 'medium'
          : findingCount > 0
            ? 'low'
            : 'none';

    // Decision logic based on findings and confidence.
    let recommendation = 'approve';
    if (hasCritical && avgConfidence > 0.7) {
      recommendation = 'block';
    } else if (hasHigh) {
      recommendation = 'request_changes';
    } else if (mediumCount >= 3) {
      recommendation = 'request_changes';
    } else if (avgConfidence < 0.6 && findingCount > 0) {
      recommendation = 'discuss';
    } else if (findingCount > 0) {
      recommendation = 'approve_with_comments';
    }

    const consensusLevel =
      avgConfidence > 0.85
        ? 'strong'
        : avgConfidence > 0.7
          ? 'moderate'
          : avgConfidence > 0.5
            ? 'weak'
            : 'uncertain';

    const agentCount = validResults.length;
    const summary =
      findingCount > 0
        ? `${agentCount} agents found ${findingCount} issue(s). ` +
          `Critical: ${criticalCount}, High: ${highCount}, ` +
          `Medium: ${mediumCount}, Low: ${lowCount}`
        : `${agentCount} agents reviewed the code. No significant issues found.`;

    // Per-agent summaries with findings included per-agent (not flattened).
    const agentSummaries = validResults.map((r) => {
      const agentFindings = findingsOf(r);
      const result = r.result as { summary?: unknown } | null | undefined;
      return {
        agent: r.agentName,
        agentId: r.agentId,
        confidence: r.confidence,
        summary:
          result && result.summary ? result.summary : 'Analysis complete',
        findingCount: agentFindings.length,
        findings: agentFindings,
      };
    });

    return cf(
      {
        summary,
        recommendation,
        overallSeverity,
        consensus: {
          level: consensusLevel,
          confidence: avgConfidence,
          agentCount,
        },
        severityCounts: {
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
        },
        agentResults: agentSummaries,
        metadata: {
          patternVersion: '1.0.0',
        },
      },
      avgConfidence
    );
  },
};
