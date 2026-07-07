/**
 * A value paired with a confidence level in [0, 1].
 *
 * Plain data, JSON-serializable — no class wrappers. This is the shape agent
 * responses already use across parallax (`{ value, confidence }`).
 */
export interface Confident<T> {
  readonly value: T;
  readonly confidence: number;
}

/** A plain value or a confidence-carrying one. */
export type MaybeConfident<T> = T | Confident<T>;

/** Confidence bands used by `uncertain()` three-way dispatch. */
export interface UncertainBounds {
  /** Minimum confidence for the `high` branch (default 0.8). */
  high: number;
  /** Minimum confidence for the `medium` branch (default 0.5). */
  medium: number;
}

export const DEFAULT_BOUNDS: UncertainBounds = { high: 0.8, medium: 0.5 };

/** Default threshold used by `coalesce()` (Prism `~??`). */
export const DEFAULT_COALESCE_THRESHOLD = 0.5;

export function isConfident<T>(x: MaybeConfident<T>): x is Confident<T> {
  return (
    typeof x === 'object' &&
    x !== null &&
    'value' in x &&
    'confidence' in x &&
    typeof (x as Confident<T>).confidence === 'number'
  );
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
