/**
 * @parallaxai/circuit-breaker
 *
 * A lightweight, zero-dependency circuit breaker for Node.js with TypeScript support.
 *
 * @example
 * ```typescript
 * import { CircuitBreaker, CircuitState, CircuitOpenError } from '@parallaxai/circuit-breaker';
 *
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeout: 30000,
 * });
 *
 * // Wrap async operations
 * const result = await breaker.execute(async () => {
 *   return await fetch('https://api.example.com/data');
 * });
 *
 * // Listen for events
 * breaker.on('state-change', ({ from, to }) => {
 *   console.log(`Circuit state changed from ${from} to ${to}`);
 * });
 * ```
 *
 * @packageDocumentation
 */

export { CircuitBreaker } from './circuit-breaker';
export type {
  CircuitBreakerEvents,
  CircuitBreakerMetrics,
  CircuitBreakerOptions,
} from './types';
export { CircuitOpenError, CircuitState } from './types';
