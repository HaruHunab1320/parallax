# Circuit Breaker Development Plan

**Package Name:** `@parallax/circuit-breaker`
**Current Location:** `packages/data-plane/src/agent-proxy/circuit-breaker.ts`
**Extraction Difficulty:** Trivial
**Estimated Effort:** 1-2 days
**Phase:** 1 (Quick Win)

## Overview

A production-ready circuit breaker implementation following the standard state machine pattern (CLOSED → OPEN → HALF_OPEN). This is the most self-contained component in Parallax with zero external dependencies.

## Current Implementation

```typescript
// packages/data-plane/src/agent-proxy/circuit-breaker.ts

export enum CircuitState {
  CLOSED = 'CLOSED',      // Normal operation, requests flow through
  OPEN = 'OPEN',          // Circuit tripped, requests rejected immediately
  HALF_OPEN = 'HALF_OPEN' // Testing recovery, limited requests allowed
}

export interface CircuitBreakerOptions {
  failureThreshold: number;   // Failures before opening circuit
  resetTimeout: number;       // ms before attempting half-open
  monitoringPeriod: number;   // Window for failure counting
}

export class CircuitBreaker extends EventEmitter {
  async execute<T>(fn: () => Promise<T>): Promise<T>
  getState(): CircuitState
  getMetrics(): CircuitBreakerMetrics
  reset(): void
}
```

## Target API

```typescript
// @parallax/circuit-breaker

import { CircuitBreaker, CircuitState } from '@parallax/circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 failures
  resetTimeout: 30000,      // Try half-open after 30s
  halfOpenMaxAttempts: 3,   // NEW: Attempts before closing again
  onStateChange: (state) => console.log(`Circuit: ${state}`)
});

// Wrap any async operation
const result = await breaker.execute(async () => {
  return await fetch('https://api.example.com/data');
});

// Check state
if (breaker.getState() === CircuitState.OPEN) {
  console.log('Circuit is open, using fallback');
}

// Get metrics
const metrics = breaker.getMetrics();
// { state, failureCount, successCount, lastFailureTime, lastSuccessTime }

// Events
breaker.on('state-change', ({ from, to }) => {});
breaker.on('success', ({ duration }) => {});
breaker.on('failure', ({ error, duration }) => {});
breaker.on('rejected', () => {}); // When circuit is open
```

## Development Phases

### Phase 1: Setup (Day 1 Morning)

- [ ] Create package structure
  ```
  packages/circuit-breaker/
  ├── src/
  │   ├── index.ts
  │   ├── circuit-breaker.ts
  │   └── types.ts
  ├── tests/
  │   └── circuit-breaker.test.ts
  ├── package.json
  ├── tsconfig.json
  └── README.md
  ```
- [ ] Copy existing implementation
- [ ] Remove any Parallax-specific imports
- [ ] Add package.json with proper metadata

### Phase 2: Enhancements (Day 1 Afternoon)

- [ ] Add `halfOpenMaxAttempts` option
- [ ] Add `onStateChange` callback option
- [ ] Add success/failure/rejected events
- [ ] Add `successThreshold` for half-open → closed transition
- [ ] Add `getMetrics()` with comprehensive stats

### Phase 3: Testing (Day 2 Morning)

- [ ] Unit tests for state transitions
- [ ] Test failure threshold behavior
- [ ] Test reset timeout behavior
- [ ] Test half-open recovery
- [ ] Test concurrent executions
- [ ] Test event emissions

### Phase 4: Documentation & Publish (Day 2 Afternoon)

- [ ] Write comprehensive README
- [ ] Add JSDoc comments to all public APIs
- [ ] Create usage examples
- [ ] Configure npm publish
- [ ] Publish v1.0.0

## Package Structure

```
@parallax/circuit-breaker/
├── src/
│   ├── index.ts           # Public exports
│   ├── circuit-breaker.ts # Main implementation
│   └── types.ts           # TypeScript interfaces
├── tests/
│   ├── circuit-breaker.test.ts
│   ├── state-transitions.test.ts
│   └── concurrent.test.ts
├── examples/
│   ├── basic-usage.ts
│   ├── with-fallback.ts
│   └── monitoring.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## API Reference

### `CircuitBreaker`

```typescript
class CircuitBreaker extends EventEmitter {
  constructor(options: CircuitBreakerOptions)

  /**
   * Execute a function with circuit breaker protection
   * @throws CircuitOpenError if circuit is open
   */
  execute<T>(fn: () => Promise<T>): Promise<T>

  /**
   * Get current circuit state
   */
  getState(): CircuitState

  /**
   * Get circuit metrics
   */
  getMetrics(): CircuitBreakerMetrics

  /**
   * Manually reset the circuit to CLOSED
   */
  reset(): void

  /**
   * Manually open the circuit
   */
  open(): void
}
```

### `CircuitBreakerOptions`

```typescript
interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;

  /** Time in ms before attempting half-open (default: 30000) */
  resetTimeout: number;

  /** Number of successes in half-open before closing (default: 1) */
  successThreshold?: number;

  /** Max attempts in half-open before reopening (default: 3) */
  halfOpenMaxAttempts?: number;

  /** Callback when state changes */
  onStateChange?: (state: CircuitState) => void;

  /** Custom failure detector (default: any thrown error) */
  isFailure?: (error: unknown) => boolean;
}
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `state-change` | `{ from: CircuitState, to: CircuitState }` | Circuit state changed |
| `success` | `{ duration: number }` | Execution succeeded |
| `failure` | `{ error: Error, duration: number }` | Execution failed |
| `rejected` | `{ state: CircuitState }` | Execution rejected (circuit open) |

## Migration Guide

### Before (Parallax Internal)

```typescript
import { CircuitBreaker } from '../agent-proxy/circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  monitoringPeriod: 60000,
});
```

### After (@parallax/circuit-breaker)

```typescript
import { CircuitBreaker } from '@parallax/circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  // monitoringPeriod removed, use event listeners instead
  onStateChange: (state) => metrics.record('circuit.state', state),
});
```

## Dependencies

**Runtime:** None (only Node.js EventEmitter)

**Development:**
- `typescript` ^5.0.0
- `vitest` ^2.0.0
- `tsup` (bundling)

## Success Criteria

- [ ] Zero runtime dependencies
- [ ] 100% test coverage
- [ ] TypeScript types included
- [ ] Works in Node.js 18+
- [ ] Works in browsers (ESM)
- [ ] < 5KB minified
- [ ] Comprehensive README with examples

## Related Packages

Existing circuit breaker packages on npm:
- `opossum` - More features but heavier
- `cockatiel` - Full resilience library
- `circuit-breaker-js` - Minimal but unmaintained

**Our differentiator:** Modern TypeScript, zero dependencies, event-driven, simple API.
