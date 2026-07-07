/**
 * Aggregation helpers for multi-agent results — ports of the utilities the
 * control plane previously injected as Prism globals (average, synthesize,
 * majorityVote) plus the consensus math the .prism pattern library
 * re-implemented per pattern.
 */
import { Confident, MaybeConfident } from './types';
import { best, cf, conf, from, val } from './core';

/** Mean confidence across results (0 for an empty list). */
export function averageConfidence(xs: Array<MaybeConfident<unknown>>): number {
  if (xs.length === 0) return 0;
  return xs.reduce((sum: number, x) => sum + conf(x), 0) / xs.length;
}

/**
 * Mean of numeric results: mean value carrying mean confidence.
 */
export function average(
  xs: Array<MaybeConfident<number>>
): Confident<number> {
  if (xs.length === 0) return cf(0, 0);
  const mean = xs.reduce((sum: number, x) => sum + val(x), 0) / xs.length;
  return cf(mean, averageConfidence(xs));
}

/**
 * Confidence-weighted mean of numeric results: values that are more
 * confident pull the result harder. Carries the mean confidence.
 */
export function weightedAverage(
  xs: Array<MaybeConfident<number>>
): Confident<number> {
  if (xs.length === 0) return cf(0, 0);
  const totalWeight = xs.reduce((sum: number, x) => sum + conf(x), 0);
  if (totalWeight === 0) return cf(0, 0);
  const weighted =
    xs.reduce((sum: number, x) => sum + val(x) * conf(x), 0) / totalWeight;
  return cf(weighted, averageConfidence(xs));
}

/**
 * Pick the single most confident result (first wins ties) — the array form
 * of `best()`, matching the control plane's old `synthesize` helper.
 */
export function synthesize<T>(xs: Array<MaybeConfident<T>>): Confident<T> {
  return best(...xs);
}

const defaultKey = (v: unknown): string => JSON.stringify(v) ?? 'undefined';

interface VoteGroup<T> {
  key: string;
  votes: number;
  representative: Confident<T>;
  confidenceSum: number;
}

function groupVotes<T>(
  xs: Array<MaybeConfident<T>>,
  keyFn: (value: T) => string
): VoteGroup<T>[] {
  const groups = new Map<string, VoteGroup<T>>();
  for (const x of xs) {
    const c = from(x);
    const key = keyFn(c.value);
    const existing = groups.get(key);
    if (existing) {
      existing.votes += 1;
      existing.confidenceSum += c.confidence;
      // Keep the most confident member as the representative
      if (c.confidence > existing.representative.confidence) {
        existing.representative = c;
      }
    } else {
      groups.set(key, {
        key,
        votes: 1,
        representative: c,
        confidenceSum: c.confidence,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.votes - a.votes);
}

/**
 * Majority vote over results, grouping by value (JSON identity by default).
 * Returns the winning value; its confidence is
 * `agreement × mean confidence of the winning group`, so a 3-way split of
 * confident agents still reads as an unconfident result.
 */
export function majorityVote<T>(
  xs: Array<MaybeConfident<T>>,
  keyFn: (value: T) => string = defaultKey
): Confident<T | undefined> {
  if (xs.length === 0) return cf(undefined, 0);
  const [winner] = groupVotes(xs, keyFn);
  const agreement = winner!.votes / xs.length;
  const groupConfidence = winner!.confidenceSum / winner!.votes;
  return cf(winner!.representative.value, agreement * groupConfidence);
}

export interface ConsensusOptions<T> {
  /** Mean confidence needed for `reached` (default 0.7, per simple-consensus). */
  confidenceThreshold?: number;
  /** Agreement ratio needed for `reached` (default 0.5). */
  agreementThreshold?: number;
  keyFn?: (value: T) => string;
}

export interface ConsensusResult<T> {
  status: 'unanimous' | 'majority' | 'split';
  winner: T | undefined;
  /** Winning votes / total votes. */
  agreement: number;
  averageConfidence: number;
  reached: boolean;
}

/**
 * Classify agreement across results — the multi-model-voting shape:
 * unanimous → all agree; majority → strictly more than half; split →
 * no value has a majority. The wrapper confidence is
 * `agreement × mean confidence of the winning group`.
 */
export function consensus<T>(
  xs: Array<MaybeConfident<T>>,
  options: ConsensusOptions<T> = {}
): Confident<ConsensusResult<T>> {
  const {
    confidenceThreshold = 0.7,
    agreementThreshold = 0.5,
    keyFn = defaultKey,
  } = options;

  if (xs.length === 0) {
    return cf(
      {
        status: 'split',
        winner: undefined,
        agreement: 0,
        averageConfidence: 0,
        reached: false,
      },
      0
    );
  }

  const groups = groupVotes(xs, keyFn);
  const winner = groups[0]!;
  const agreement = winner.votes / xs.length;
  const avgConfidence = averageConfidence(xs);
  const status: ConsensusResult<T>['status'] =
    groups.length === 1 ? 'unanimous' : agreement > 0.5 ? 'majority' : 'split';

  const result: ConsensusResult<T> = {
    status,
    winner: status === 'split' ? undefined : winner.representative.value,
    agreement,
    averageConfidence: avgConfidence,
    reached:
      avgConfidence >= confidenceThreshold && agreement >= agreementThreshold,
  };
  const groupConfidence = winner.confidenceSum / winner.votes;
  return cf(result, agreement * groupConfidence);
}
