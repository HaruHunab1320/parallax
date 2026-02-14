/**
 * Circuit breaker state machine states
 */
export enum CircuitState {
  /** Normal operation - requests flow through */
  CLOSED = 'CLOSED',
  /** Circuit tripped - requests are rejected immediately */
  OPEN = 'OPEN',
  /** Testing recovery - limited requests allowed */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Configuration options for the circuit breaker
 */
export interface CircuitBreakerOptions {
  /**
   * Number of failures before the circuit opens
   * @default 5
   */
  failureThreshold: number;

  /**
   * Time in milliseconds before attempting to close the circuit (half-open state)
   * @default 30000
   */
  resetTimeout: number;

  /**
   * Number of successful calls in half-open state before closing the circuit
   * @default 3
   */
  successThreshold?: number;

  /**
   * Maximum attempts in half-open state before reopening
   * @default 5
   */
  halfOpenMaxAttempts?: number;

  /**
   * Callback invoked when circuit state changes
   */
  onStateChange?: (state: CircuitState, previousState: CircuitState) => void;

  /**
   * Custom function to determine if an error should count as a failure
   * @default () => true (all errors are failures)
   */
  isFailure?: (error: unknown) => boolean;
}

/**
 * Metrics returned by getMetrics()
 */
export interface CircuitBreakerMetrics {
  /** Current circuit state */
  state: CircuitState;
  /** Number of consecutive failures */
  failureCount: number;
  /** Number of consecutive successes (in half-open state) */
  successCount: number;
  /** Total number of executions */
  totalExecutions: number;
  /** Total number of successful executions */
  totalSuccesses: number;
  /** Total number of failed executions */
  totalFailures: number;
  /** Total number of rejected executions (circuit open) */
  totalRejections: number;
  /** Timestamp of last failure */
  lastFailureTime?: Date;
  /** Timestamp of last success */
  lastSuccessTime?: Date;
  /** Timestamp when circuit will attempt reset (if open) */
  nextAttemptTime?: Date;
}

/**
 * Event payloads for circuit breaker events
 */
export interface CircuitBreakerEvents {
  'state-change': { from: CircuitState; to: CircuitState };
  'success': { duration: number };
  'failure': { error: unknown; duration: number };
  'rejected': { state: CircuitState };
}

/**
 * Error thrown when the circuit breaker is open
 */
export class CircuitOpenError extends Error {
  readonly state: CircuitState;
  readonly nextAttemptTime?: Date;

  constructor(message: string, state: CircuitState, nextAttemptTime?: Date) {
    super(message);
    this.name = 'CircuitOpenError';
    this.state = state;
    this.nextAttemptTime = nextAttemptTime;
  }
}
