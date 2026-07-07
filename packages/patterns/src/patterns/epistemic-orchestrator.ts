import { cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

const recommendationOf = (r: PatternAgentResult | undefined): unknown =>
  (r?.result as { recommendation?: unknown } | null | undefined)
    ?.recommendation;

/** Converted from patterns/epistemic-orchestrator.prism (v1.0.0). */
export const epistemicOrchestrator: PatternModule = {
  meta: {
    name: 'EpistemicOrchestrator',
    version: '2.0.0',
    description:
      'Orchestrate multiple expert agents, identifying valuable disagreements',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          analysisType: { type: 'string' },
        },
      },
    },
    capabilities: ['code-analysis'],
    minAgents: 4,
  },

  async execute(ctx) {
    const expertAnalyses = ctx.results;
    const agentCount = expertAnalyses.length;

    let hasDisagreement = false;
    let disagreementDetails = '';

    const expert1 = expertAnalyses[0];
    const expert2 = expertAnalyses[1];
    const expert3 = expertAnalyses[2];

    // Disagreement between the first two experts: both highly confident
    // yet recommending different things.
    if (agentCount >= 2 && expert1 && expert2) {
      if (expert1.confidence > 0.8 && expert2.confidence > 0.8) {
        if (recommendationOf(expert1) !== recommendationOf(expert2)) {
          hasDisagreement = true;
          disagreementDetails = `High-confidence disagreement between ${expert1.agentName} and ${expert2.agentName}`;
        }
      }
    }

    // Check the third expert against the first.
    if (agentCount >= 3 && expert1 && expert3) {
      if (expert3.confidence > 0.8 && expert1.confidence > 0.8) {
        if (
          recommendationOf(expert3) !== recommendationOf(expert1) &&
          !hasDisagreement
        ) {
          hasDisagreement = true;
          disagreementDetails = `High-confidence disagreement between ${expert1.agentName} and ${expert3.agentName}`;
        }
      }
    }

    // Consensus metrics — the original only summed the first four experts'
    // confidence while dividing by the full agent count; preserved.
    const totalConfidence = expertAnalyses
      .slice(0, 4)
      .reduce((sum, r) => sum + r.confidence, 0);
    const avgConfidence = agentCount > 0 ? totalConfidence / agentCount : 0;

    let consensusLevel: string;
    if (avgConfidence > 0.8 && !hasDisagreement) {
      consensusLevel = 'strong_consensus';
    } else if (avgConfidence > 0.6 && !hasDisagreement) {
      consensusLevel = 'moderate_consensus';
    } else if (hasDisagreement) {
      consensusLevel = 'valuable_disagreement';
    } else {
      consensusLevel = 'weak_consensus';
    }

    // Epistemic confidence is discounted when there is valuable
    // disagreement — the disagreement itself is the signal.
    const epistemicConfidence = hasDisagreement
      ? avgConfidence * 0.8
      : avgConfidence;

    return cf(
      {
        consensusLevel,
        averageConfidence: avgConfidence,
        hasDisagreement,
        disagreementDetails,
        expertCount: agentCount,
        analyses: expertAnalyses,
        recommendation: hasDisagreement
          ? 'Multiple valid perspectives identified - review all expert analyses'
          : recommendationOf(expert1),
      },
      epistemicConfidence
    );
  },
};
