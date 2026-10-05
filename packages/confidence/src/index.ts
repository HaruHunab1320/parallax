export type { ConsensusOptions, ConsensusResult } from './aggregate';
export {
  average,
  averageConfidence,
  consensus,
  majorityVote,
  synthesize,
  weightedAverage,
} from './aggregate';

export type { PropOptions } from './core';
export {
  add,
  and,
  best,
  cf,
  chain,
  coalesce,
  conf,
  div,
  eq,
  from,
  gate,
  gt,
  gte,
  lift,
  lt,
  lte,
  mul,
  neq,
  or,
  parseConfidenceMarker,
  prop,
  stripAnsi,
  sub,
  val,
} from './core';
export type { Confident, MaybeConfident, UncertainBounds } from './types';
export {
  clamp01,
  DEFAULT_BOUNDS,
  DEFAULT_COALESCE_THRESHOLD,
  isConfident,
} from './types';
export type { UncertainHandlers } from './uncertain';
export { band, uncertain } from './uncertain';
