import { EventEmitter } from 'events';
import {
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreakerMetrics,
  CircuitOpenError,
} from './types';

/**
 * A circuit breaker implementation for handling failures gracefully.
 *
 * The circuit breaker pattern prevents cascading failures by failing fast
 * when a service is unavailable, and automatically recovering when it becomes available again.
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeout: 30000,
 * });
 *
 * try {
 *   const result = await breaker.execute(async () => {
 *     return await fetchFromExternalService();
 *   });
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     // Circuit is open, use fallback
 *   }
 * }
 * ```
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private halfOpenAttempts: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;

  // Lifetime metrics
  private totalExecutions: number = 0;
  private totalSuccesses: number = 0;
  private totalFailures: number = 0;
  private totalRejections: number = 0;

  private readonly options: Required<
    Pick<CircuitBreakerOptions, 'failureThreshold' | 'resetTimeout' | 'successThreshold' | 'halfOpenMaxAttempts'>
  > & CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    super();
    this.options = {
      successThreshold: 3,
      halfOpenMaxAttempts: 5,
      ...options,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   *
   * @param fn - The async function to execute
   * @returns The result of the function
   * @throws CircuitOpenError if the circuit is open
   * @throws The original error if the function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should reject immediately
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        this.totalRejections++;
        this.emit('rejected', { state: this.state });
        throw new CircuitOpenError(
          'Circuit breaker is OPEN',
          this.state,
          this.nextAttemptTime
        );
      }
    }

    // Track half-open attempts
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
    }

    const startTime = Date.now();
    this.totalExecutions++;

    try {
      const result = await fn();
      this.onSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      const isFailure = this.options.isFailure?.(error) ?? true;
      if (isFailure) {
        this.onFailure(error, Date.now() - startTime);
      } else {
        // If not considered a failure, still count as success for circuit purposes
        this.onSuccess(Date.now() - startTime);
      }
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(duration: number): void {
    this.totalSuccesses++;
    this.failureCount = 0;
    this.lastSuccessTime = new Date();

    this.emit('success', { duration });

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.successCount = 0;
        this.halfOpenAttempts = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: unknown, duration: number): void {
    this.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = new Date();

    this.emit('failure', { error, duration });

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery attempt - reopen circuit
      this.successCount = 0;
      this.halfOpenAttempts = 0;
      this.openCircuit();
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we've exceeded the failure threshold
      if (this.failureCount >= this.options.failureThreshold) {
        this.openCircuit();
      }
    }
  }

  /**
   * Open the circuit
   */
  private openCircuit(): void {
    this.nextAttemptTime = new Date(Date.now() + this.options.resetTimeout);
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Check if we should attempt to reset (transition to half-open)
   */
  private shouldAttemptReset(): boolean {
    return (
      this.nextAttemptTime !== undefined && new Date() >= this.nextAttemptTime
    );
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const previousState = this.state;
    this.state = newState;

    // Reset attempt time when closing
    if (newState === CircuitState.CLOSED) {
      this.nextAttemptTime = undefined;
      this.failureCount = 0;
    }

    this.emit('state-change', { from: previousState, to: newState });
    this.options.onStateChange?.(newState, previousState);
  }

  /**
   * Get the current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalExecutions: this.totalExecutions,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      totalRejections: this.totalRejections,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Manually reset the circuit to CLOSED state
   */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.nextAttemptTime = undefined;
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Manually open the circuit
   */
  open(): void {
    this.openCircuit();
  }

  /**
   * Check if the circuit is currently allowing requests
   */
  isAllowingRequests(): boolean {
    if (this.state === CircuitState.CLOSED) return true;
    if (this.state === CircuitState.HALF_OPEN) return true;
    return this.shouldAttemptReset();
  }
}
