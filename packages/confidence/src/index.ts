export type { Confident, MaybeConfident, UncertainBounds } from './types';
export {
  DEFAULT_BOUNDS,
  DEFAULT_COALESCE_THRESHOLD,
  isConfident,
  clamp01,
} from './types';

export type { PropOptions } from './core';
export {
  cf,
  from,
  conf,
  val,
  chain,
  coalesce,
  and,
  or,
  lift,
  add,
  sub,
  mul,
  div,
  eq,
  neq,
  gt,
  gte,
  lt,
  lte,
  best,
  gate,
  prop,
  parseConfidenceMarker,
  stripAnsi,
} from './core';

export type { UncertainHandlers } from './uncertain';
export { uncertain, band } from './uncertain';

export type { ConsensusOptions, ConsensusResult } from './aggregate';
export {
  averageConfidence,
  average,
  weightedAverage,
  synthesize,
  majorityVote,
  consensus,
} from './aggregate';
