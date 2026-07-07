/**
 * Port of Prism's `uncertain if` three-branch dispatch:
 *
 *   uncertain if (x ~> 0.8) {
 *     high   { ... }   // confidence >= bounds.high
 *     medium { ... }   // confidence >= bounds.medium
 *     low    { ... }   // otherwise
 *   }
 */
import {
  Confident,
  MaybeConfident,
  UncertainBounds,
  DEFAULT_BOUNDS,
  isConfident,
} from './types';
import { cf, conf, val } from './core';

export interface UncertainHandlers<T, R> {
  high: (value: T, confidence: number) => MaybeConfident<R>;
  medium: (value: T, confidence: number) => MaybeConfident<R>;
  low: (value: T, confidence: number) => MaybeConfident<R>;
}

/**
 * Dispatch on confidence band. The handler receives the unwrapped value and
 * its confidence. If the handler returns a `Confident`, that is returned
 * as-is; a plain return value is paired with the input's confidence.
 */
export function uncertain<T, R>(
  x: MaybeConfident<T>,
  handlers: UncertainHandlers<T, R>,
  bounds: UncertainBounds = DEFAULT_BOUNDS
): Confident<R> {
  const c = conf(x);
  const v = val(x);
  const handler =
    c >= bounds.high
      ? handlers.high
      : c >= bounds.medium
        ? handlers.medium
        : handlers.low;
  const result = handler(v, c);
  return isConfident(result) ? result : cf(result, c);
}

/** Which band a confidence level falls in, for logging/routing decisions. */
export function band(
  x: MaybeConfident<unknown>,
  bounds: UncertainBounds = DEFAULT_BOUNDS
): 'high' | 'medium' | 'low' {
  const c = conf(x);
  return c >= bounds.high ? 'high' : c >= bounds.medium ? 'medium' : 'low';
}
