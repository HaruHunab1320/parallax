import { cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

const issuesOf = (r: PatternAgentResult | undefined): unknown[] =>
  (r?.result as { issues?: unknown[] } | null | undefined)?.issues ?? [];

/**
 * Converted from patterns/multi-validator.prism (v1.0.0) — the manually
 * unrolled validators are a loop now, still capped at four as in the script.
 * Per the script's demo convention, a result with confidence > 0.6 counts as
 * "valid" (agents don't return an explicit valid flag).
 */
export const multiValidator: PatternModule = {
  meta: {
    name: 'MultiValidator',
    version: '2.0.0',
    description:
      'Validate data across multiple validators with fast path optimization',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          data: { type: 'any' },
          validationType: { type: 'string' },
          fastPathThreshold: { type: 'number' },
        },
      },
    },
    capabilities: ['validation'],
    minAgents: 2,
  },

  async execute(ctx) {
    const fastPathThreshold: number = ctx.input?.fastPathThreshold ?? 0.9;
    const validationType: string = ctx.input?.validationType ?? 'general';
    const results = ctx.results;

    let validCount = 0;
    let invalidCount = 0;
    let totalConfidence = 0;
    let fastPathSuccess = false;

    // First validator: fast path attempt.
    const first = results[0];
    if (first) {
      const conf1 = first.confidence;
      totalConfidence += conf1;
      const isValid1 = conf1 > 0.6;
      if (conf1 >= fastPathThreshold && isValid1) {
        fastPathSuccess = true;
        validCount++;
      } else if (isValid1) {
        validCount++;
      } else {
        invalidCount++;
      }
    }

    // Additional validators (up to four total) when the fast path missed.
    if (!fastPathSuccess) {
      const maxValidators = Math.min(results.length, 4);
      for (let i = 1; i < maxValidators; i++) {
        const c = results[i]!.confidence;
        totalConfidence += c;
        if (c > 0.6) validCount++;
        else invalidCount++;
      }
    }

    const totalVotes = validCount + invalidCount;
    const isValid = validCount > invalidCount;
    const avgConfidence = totalVotes > 0 ? totalConfidence / totalVotes : 0;

    let finalResult: Record<string, unknown>;
    if (fastPathSuccess && first) {
      finalResult = {
        valid: true,
        confidence: first.confidence,
        validatedBy: first.agentName,
        mode: 'fast_path',
        issues: issuesOf(first),
        metadata: {
          validationType,
          processingTime: 'fast',
          validatorsUsed: 1,
          message: 'High confidence validation achieved quickly',
        },
      };
    } else {
      finalResult = {
        valid: isValid,
        confidence: avgConfidence,
        validatedBy: 'multiple validators',
        mode: 'multi_validator',
        consensus: {
          validVotes: validCount,
          invalidVotes: invalidCount,
          strength:
            totalVotes > 0
              ? validCount > invalidCount
                ? (validCount - invalidCount) / totalVotes
                : (invalidCount - validCount) / totalVotes
              : 0,
        },
        issues: issuesOf(first),
        metadata: {
          validationType,
          processingTime: 'thorough',
          validatorsUsed: totalVotes,
          message: isValid
            ? 'Consensus: data is valid'
            : 'Consensus: data is invalid',
        },
      };
    }

    return cf(finalResult, avgConfidence);
  },
};
