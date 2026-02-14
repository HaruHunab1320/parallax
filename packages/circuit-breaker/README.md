# @parallax/circuit-breaker

A lightweight, zero-dependency circuit breaker for Node.js with TypeScript support.

## Features

- **Zero dependencies** - Just Node.js EventEmitter
- **TypeScript first** - Full type definitions included
- **Event-driven** - Subscribe to state changes and metrics
- **Configurable** - Thresholds, timeouts, custom failure detection
- **Tiny** - < 5KB minified

## Installation

```bash
npm install @parallax/circuit-breaker
# or
pnpm add @parallax/circuit-breaker
# or
yarn add @parallax/circuit-breaker
```

## Quick Start

```typescript
import { CircuitBreaker, CircuitOpenError } from '@parallax/circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,     // Open after 5 failures
  resetTimeout: 30000,     // Try again after 30 seconds
});

// Wrap any async operation
try {
  const result = await breaker.execute(async () => {
    return await fetch('https://api.example.com/data');
  });
} catch (error) {
  if (error instanceof CircuitOpenError) {
    // Circuit is open - use fallback or cached data
    console.log('Service unavailable, using fallback');
  } else {
    // Actual error from the service
    throw error;
  }
}
```

## How It Works

The circuit breaker pattern prevents cascading failures by "breaking" the circuit when a service is failing:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   CLOSED ──────────────> OPEN ──────────────> HALF_OPEN         │
│     │                      │                      │              │
│     │ failure >= threshold │ resetTimeout         │              │
│     │                      │                      │              │
│     │                      │    success >= threshold             │
│     │                      │         │                           │
│     └──────────────────────┘         └───────> CLOSED           │
│                                                                  │
│   failure in HALF_OPEN ──────────────────────> OPEN             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

1. **CLOSED** - Normal operation, requests flow through
2. **OPEN** - Circuit tripped, requests fail fast without calling the service
3. **HALF_OPEN** - Testing if service recovered, limited requests allowed

## API

### `new CircuitBreaker(options)`

Create a new circuit breaker instance.

```typescript
interface CircuitBreakerOptions {
  /** Number of failures before opening (default: 5) */
  failureThreshold: number;

  /** Time in ms before attempting recovery (default: 30000) */
  resetTimeout: number;

  /** Successes needed to close from half-open (default: 3) */
  successThreshold?: number;

  /** Max attempts in half-open before reopening (default: 5) */
  halfOpenMaxAttempts?: number;

  /** Callback when state changes */
  onStateChange?: (state: CircuitState, previousState: CircuitState) => void;

  /** Custom failure detection (default: all errors are failures) */
  isFailure?: (error: unknown) => boolean;
}
```

### `breaker.execute(fn)`

Execute an async function with circuit breaker protection.

```typescript
const result = await breaker.execute(async () => {
  return await someAsyncOperation();
});
```

### `breaker.getState()`

Get the current circuit state.

```typescript
import { CircuitState } from '@parallax/circuit-breaker';

if (breaker.getState() === CircuitState.OPEN) {
  console.log('Circuit is open');
}
```

### `breaker.getMetrics()`

Get circuit breaker metrics.

```typescript
const metrics = breaker.getMetrics();
// {
//   state: 'CLOSED',
//   failureCount: 0,
//   successCount: 0,
//   totalExecutions: 100,
//   totalSuccesses: 95,
//   totalFailures: 5,
//   totalRejections: 0,
//   lastFailureTime: Date,
//   lastSuccessTime: Date,
//   nextAttemptTime: Date | undefined,
// }
```

### `breaker.reset()`

Manually reset the circuit to CLOSED state.

```typescript
breaker.reset();
```

### `breaker.open()`

Manually open the circuit.

```typescript
breaker.open();
```

### `breaker.isAllowingRequests()`

Check if the circuit is currently allowing requests.

```typescript
if (breaker.isAllowingRequests()) {
  // Safe to try
}
```

## Events

```typescript
breaker.on('state-change', ({ from, to }) => {
  console.log(`Circuit changed from ${from} to ${to}`);
});

breaker.on('success', ({ duration }) => {
  console.log(`Call succeeded in ${duration}ms`);
});

breaker.on('failure', ({ error, duration }) => {
  console.log(`Call failed in ${duration}ms:`, error);
});

breaker.on('rejected', ({ state }) => {
  console.log(`Call rejected, circuit is ${state}`);
});
```

## Advanced Usage

### Custom Failure Detection

Only count certain errors as failures:

```typescript
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  isFailure: (error) => {
    // Only count 5xx errors as failures
    if (error instanceof Response) {
      return error.status >= 500;
    }
    return true;
  },
});
```

### With Fallback

```typescript
async function fetchWithFallback() {
  try {
    return await breaker.execute(async () => {
      return await fetch('/api/data');
    });
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      // Return cached data when circuit is open
      return getCachedData();
    }
    throw error;
  }
}
```

### Monitoring

```typescript
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  onStateChange: (state, previous) => {
    metrics.gauge('circuit_breaker_state', state === 'OPEN' ? 1 : 0);
    alerting.send(`Circuit changed: ${previous} -> ${state}`);
  },
});

// Periodic metrics export
setInterval(() => {
  const m = breaker.getMetrics();
  metrics.gauge('circuit_breaker_failures', m.totalFailures);
  metrics.gauge('circuit_breaker_successes', m.totalSuccesses);
}, 10000);
```

## License

MIT
