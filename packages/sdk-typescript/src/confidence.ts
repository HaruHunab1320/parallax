/**
 * Confidence utilities for agents — built on @parallaxai/confidence.
 *
 * The full combinator library (cf, conf, best, coalesce, uncertain,
 * consensus, …) is re-exported here so agents can express confidence logic
 * without a separate import.
 */
import { isConfident } from '@parallaxai/confidence';

export * from '@parallaxai/confidence';

/**
 * Extracts a confidence level from an agent's raw return value.
 *
 * Order: an explicit numeric `confidence` field wins; a `Confident`-shaped
 * value uses its confidence; anything else gets `fallback` (default 0.5 —
 * an honest "unknown", not a claim).
 */
export type ConfidenceExtractor = (result: unknown) => number;

export function defaultExtractor(fallback = 0.5): ConfidenceExtractor {
  return (result: unknown): number => {
    if (isConfident(result)) return result.confidence;
    if (
      typeof result === 'object' &&
      result !== null &&
      typeof (result as { confidence?: unknown }).confidence === 'number'
    ) {
      return (result as { confidence: number }).confidence;
    }
    return fallback;
  };
}

/**
 * Decorator that normalizes an agent method's return value to a
 * `[result, confidence]` tuple. Pass a custom extractor to control how
 * confidence is derived when the method doesn't return one explicitly.
 *
 * @example
 * ```typescript
 * class MyAgent extends ParallaxAgent {
 *   @withConfidence
 *   async analyze(task: string, data?: any): Promise<[any, number]> {
 *     return await this.llm.analyze(data); // { ..., confidence: 0.83 }
 *   }
 * }
 * ```
 */
export function withConfidence(
  _target: any,
  _propertyName: string,
  descriptor: PropertyDescriptor
) {
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error('withConfidence can only be applied to methods');
  }

  const originalMethod = descriptor.value;
  const extract = defaultExtractor();

  descriptor.value = async function (...args: any[]) {
    const result = await originalMethod.apply(this, args);

    if (
      Array.isArray(result) &&
      result.length === 2 &&
      typeof result[1] === 'number'
    ) {
      return result;
    }

    return [result, extract(result)];
  };

  return descriptor;
}

/**
 * Functional form of `withConfidence`, with an optional custom extractor.
 *
 * @example
 * ```typescript
 * const analyze = withConfidenceWrapper(
 *   async (task, data) => llm.analyze(data),
 *   (r) => r.certainty ?? 0.5
 * );
 * ```
 */
export function withConfidenceWrapper<
  T extends (...args: any[]) => Promise<any>,
>(
  fn: T,
  extractor: ConfidenceExtractor = defaultExtractor()
): (...args: Parameters<T>) => Promise<[any, number]> {
  return async (...args: Parameters<T>) => {
    const result = await fn(...args);

    if (
      Array.isArray(result) &&
      result.length === 2 &&
      typeof result[1] === 'number'
    ) {
      return result as [any, number];
    }

    return [result, extractor(result)] as [any, number];
  };
}
