import { cf } from '@parallaxai/confidence';
import type { PatternModule } from '../types';

/** Shape of a voting agent's payload. */
type VotePayload = Record<string, any>;

/**
 * Converted from patterns/voting.prism (v1.0.0).
 *
 * Note: the original used a simplified first-vote tally (count how many
 * agents match the FIRST valid decision) rather than a true plurality
 * grouping — preserved as-is instead of using
 * @parallaxai/confidence's majorityVote, which would group all decisions
 * and could pick a different winner when the first voter is in the
 * minority.
 */
export const voting: PatternModule = {
  meta: {
    name: 'MultiModelVoting',
    version: '2.0.0',
    description:
      'Aggregates votes from multiple AI models and determines consensus',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array' },
          context: { type: 'string' },
        },
      },
    },
    capabilities: ['voting', 'decision'],
    minAgents: 2,
  },

  async execute(ctx) {
    // Filter to only successful results with valid decisions
    const validResults = ctx.results.filter(
      (r) => r.confidence > 0 && r.result && (r.result as VotePayload).decision
    );

    // First valid vote (the original's reduce kept the first decision)
    const firstVote: string =
      validResults.length > 0
        ? (validResults[0]!.result as VotePayload).decision
        : '';

    // Count how many match the first decision
    const matchFirst = validResults.filter(
      (r) => (r.result as VotePayload).decision === firstVote
    ).length;

    // Check if unanimous (all match first)
    const isUnanimous =
      matchFirst === validResults.length && validResults.length > 0;

    // Average confidence
    const confidenceSum = validResults.reduce(
      (sum, r) => sum + r.confidence,
      0
    );
    const avgConfidence =
      validResults.length > 0 ? confidenceSum / validResults.length : 0;

    const totalVotes = validResults.length;
    const majorityThreshold = totalVotes > 0 ? totalVotes / 2 : 0;
    const hasMajority = matchFirst > majorityThreshold;

    const consensusType = isUnanimous
      ? 'unanimous'
      : hasMajority
        ? 'majority'
        : 'split';

    const consensusConfidence = isUnanimous
      ? avgConfidence
      : hasMajority
        ? avgConfidence * 0.8
        : avgConfidence * 0.5;

    const needsHumanReview =
      consensusType === 'split' || consensusConfidence < 0.6;

    const finalDecision = isUnanimous || hasMajority ? firstVote : null;

    const voteDetails = validResults.map((r) => ({
      agent: r.agentName,
      agentId: r.agentId,
      model: (r.result as VotePayload).model,
      decision: (r.result as VotePayload).decision,
      confidence: r.confidence,
      reasoning: r.reasoning,
    }));

    const agentCount = validResults.length;

    const summary = isUnanimous
      ? `${agentCount} models voted unanimously for: ${firstVote}`
      : hasMajority
        ? `${agentCount} models reached majority for: ${firstVote} (${matchFirst}/${totalVotes} votes)`
        : `${agentCount} models could not reach consensus - human review recommended`;

    const output = {
      decision: finalDecision,
      consensus: {
        type: consensusType,
        confidence: consensusConfidence,
        isUnanimous,
        hasMajority,
        needsHumanReview,
      },
      summary,
      votes: {
        total: totalVotes,
        forWinner: matchFirst,
        breakdown: voteDetails,
      },
      metadata: {
        patternVersion: '2.0.0',
        agentCount,
      },
    };

    return cf(output, consensusConfidence);
  },
};
