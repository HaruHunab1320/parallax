/**
 * Core combinators — a TypeScript port of the Prism DSL's confidence
 * operators. Each combinator documents the operator it replaces and applies
 * the same propagation rule (see docs/prism-specs.md, "Confidence
 * Propagation Rules"):
 *
 *   arithmetic/comparison → min confidence of operands
 *   AND (~&&)             → min confidence
 *   OR (~||)              → max confidence
 *   parallel select (~||>) → highest-confidence operand wins
 *   coalesce (~??)        → first operand above threshold
 *   property access (~.)  → confidence degrades on missing hops
 *
 * Plain (non-Confident) inputs are treated as certain (confidence 1.0),
 * matching Prism, where an unannotated value is fully trusted until an
 * operation says otherwise.
 */
import {
  Confident,
  MaybeConfident,
  DEFAULT_COALESCE_THRESHOLD,
  clamp01,
  isConfident,
} from './types';

/** Prism `x ~> c` — attach a confidence level to a value. */
export function cf<T>(value: T, confidence: number): Confident<T> {
  return { value, confidence: clamp01(confidence) };
}

/** Normalize a plain or confident value into a `Confident`. */
export function from<T>(x: MaybeConfident<T>): Confident<T> {
  return isConfident(x) ? x : cf(x, 1.0);
}

/** Prism `<~ x` — extract the confidence level (1.0 for plain values). */
export function conf(x: MaybeConfident<unknown>): number {
  return isConfident(x) ? x.confidence : 1.0;
}

/** Unwrap the underlying value (identity for plain values). */
export function val<T>(x: MaybeConfident<T>): T {
  return isConfident(x) ? x.value : x;
}

/**
 * Prism `a ~~ b ~~ c` — chain: the last operand's value, carrying the
 * minimum confidence seen anywhere in the chain.
 */
export function chain<T>(
  ...xs: [...MaybeConfident<unknown>[], MaybeConfident<T>]
): Confident<T> {
  if (xs.length === 0) throw new Error('chain() requires at least one value');
  const confidence = Math.min(...xs.map(conf));
  return cf(val(xs[xs.length - 1] as MaybeConfident<T>), confidence);
}

/**
 * Prism `a ~?? b ~?? c` — coalesce: the first operand whose confidence
 * meets `threshold`. If none qualify, the last operand is returned (the
 * cascade's default), keeping its own confidence.
 */
export function coalesce<T>(
  xs: Array<MaybeConfident<T>>,
  threshold: number = DEFAULT_COALESCE_THRESHOLD
): Confident<T> {
  if (xs.length === 0) throw new Error('coalesce() requires at least one value');
  for (const x of xs) {
    if (conf(x) >= threshold) return from(x);
  }
  return from(xs[xs.length - 1]!);
}

/**
 * Prism `a ~&& b` — logical AND: JS `&&` on the values, minimum confidence.
 */
export function and<A, B>(
  a: MaybeConfident<A>,
  b: MaybeConfident<B>
): Confident<A | B> {
  const v = (val(a) as A | B) && (val(b) as A | B);
  return cf(v, Math.min(conf(a), conf(b)));
}

/**
 * Prism `a ~|| b` — logical OR: JS `||` on the values, maximum confidence.
 */
export function or<A, B>(
  a: MaybeConfident<A>,
  b: MaybeConfident<B>
): Confident<A | B> {
  const v = (val(a) as A | B) || (val(b) as A | B);
  return cf(v, Math.max(conf(a), conf(b)));
}

/**
 * Lift any pure function into the confidence algebra: applies `fn` to the
 * unwrapped values and carries the minimum confidence of all arguments.
 * This is the generic form behind Prism's `~+ ~- ~* ~/ ~== ~!= ~> ~>= ~< ~<=`.
 */
export function lift<Args extends unknown[], R>(
  fn: (...args: Args) => R
): (...args: { [K in keyof Args]: MaybeConfident<Args[K]> }) => Confident<R> {
  return (...args) => {
    const values = args.map((a) => val(a)) as Args;
    const confidence =
      args.length === 0 ? 1.0 : Math.min(...args.map((a) => conf(a)));
    return cf(fn(...values), confidence);
  };
}

// The ten Prism arithmetic/comparison operators, pre-lifted.
export const add = lift((a: number, b: number) => a + b); // ~+
export const sub = lift((a: number, b: number) => a - b); // ~-
export const mul = lift((a: number, b: number) => a * b); // ~*
export const div = lift((a: number, b: number) => a / b); // ~/
export const eq = lift((a: unknown, b: unknown) => a === b); // ~==
export const neq = lift((a: unknown, b: unknown) => a !== b); // ~!=
export const gt = lift((a: number, b: number) => a > b); // ~>
export const gte = lift((a: number, b: number) => a >= b); // ~>=
export const lt = lift((a: number, b: number) => a < b); // ~<
export const lte = lift((a: number, b: number) => a <= b); // ~<=

/**
 * Prism `a ~||> b ~||> c` — parallel selection: the operand with the
 * highest confidence wins (first wins ties).
 */
export function best<T>(...xs: Array<MaybeConfident<T>>): Confident<T> {
  if (xs.length === 0) throw new Error('best() requires at least one value');
  let winner = from(xs[0]!);
  for (const x of xs.slice(1)) {
    const c = from(x);
    if (c.confidence > winner.confidence) winner = c;
  }
  return winner;
}

/**
 * Prism `check ~@> action` — threshold gate: if the input's confidence
 * meets `threshold`, apply `fn` (carrying the input's confidence);
 * otherwise return `cf(undefined, 0)` so a following `coalesce` falls
 * through to its next option.
 */
export function gate<T, R>(
  x: MaybeConfident<T>,
  threshold: number,
  fn: (value: T) => R
): Confident<R | undefined> {
  const c = conf(x);
  if (c >= threshold) return cf(fn(val(x)), c);
  return cf(undefined, 0);
}

export interface PropOptions {
  /**
   * Confidence multiplier applied for the missing hop and each remaining
   * hop once the path breaks (default 0.5). Successful hops don't degrade.
   */
  missingPenalty?: number;
}

/**
 * Prism `obj ~. a ~. b` — safe navigation: walks `path` ('a.b.c' or array),
 * never throwing. While hops resolve, confidence is unchanged; once a hop
 * is null/undefined/missing, the value becomes `undefined` and confidence
 * is multiplied by `missingPenalty` for that hop and each hop not reached.
 */
export function prop<T = unknown>(
  x: MaybeConfident<unknown>,
  path: string | Array<string | number>,
  options: PropOptions = {}
): Confident<T | undefined> {
  const penalty = options.missingPenalty ?? 0.5;
  const hops = Array.isArray(path) ? path : path.split('.');
  let current: unknown = val(x);
  let confidence = conf(x);

  for (let i = 0; i < hops.length; i++) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      !(String(hops[i]) in (current as Record<string, unknown>))
    ) {
      const remaining = hops.length - i;
      return cf(undefined, confidence * Math.pow(penalty, remaining));
    }
    current = (current as Record<string, unknown>)[String(hops[i])];
  }
  return cf(current as T, confidence);
}

/**
 * Extract a trailing confidence marker from free text — the convention CLI
 * agents use to report confidence in a turn:
 *
 *   CONFIDENCE: 0.85
 *
 * Case-insensitive; the LAST marker wins (agents may quote the instruction
 * earlier in their output). Values are clamped to [0, 1]. Returns
 * undefined when no marker is present.
 */
export function parseConfidenceMarker(text: string): number | undefined {
  if (!text) return undefined;
  const matches = text.match(/confidence:\s*([0-9]*\.?[0-9]+)/gi);
  if (!matches || matches.length === 0) return undefined;
  const last = matches[matches.length - 1]!;
  const value = Number.parseFloat(last.replace(/confidence:\s*/i, ''));
  if (Number.isNaN(value)) return undefined;
  return clamp01(value);
}
