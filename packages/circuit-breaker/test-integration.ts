/**
 * Integration test - verifies the built package works correctly
 * Run with: npx tsx test-integration.ts
 */

import { CircuitBreaker, CircuitState, CircuitOpenError } from './src/index';

async function main() {
  console.log('Testing @parallax/circuit-breaker integration...\n');

  // Create a circuit breaker
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 1000,
    successThreshold: 2,
  });

  console.log('1. Initial state:', breaker.getState());
  console.assert(breaker.getState() === CircuitState.CLOSED, 'Should start CLOSED');

  // Test successful execution
  const result = await breaker.execute(async () => 'Hello, World!');
  console.log('2. Successful execution result:', result);
  console.assert(result === 'Hello, World!', 'Should return result');

  // Test failure counting
  let failCount = 0;
  for (let i = 0; i < 3; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error('Simulated failure');
      });
    } catch (e) {
      failCount++;
    }
  }
  console.log('3. After 3 failures, state:', breaker.getState());
  console.assert(breaker.getState() === CircuitState.OPEN, 'Should be OPEN after threshold');

  // Test rejection when open
  try {
    await breaker.execute(async () => 'Should not run');
    console.assert(false, 'Should have thrown');
  } catch (e) {
    console.log('4. Correctly rejected with:', e instanceof CircuitOpenError ? 'CircuitOpenError' : 'Other error');
    console.assert(e instanceof CircuitOpenError, 'Should throw CircuitOpenError');
  }

  // Test metrics
  const metrics = breaker.getMetrics();
  console.log('5. Metrics:', {
    state: metrics.state,
    totalExecutions: metrics.totalExecutions,
    totalSuccesses: metrics.totalSuccesses,
    totalFailures: metrics.totalFailures,
    totalRejections: metrics.totalRejections,
  });
  console.assert(metrics.totalExecutions === 4, 'Should have 4 executions');
  console.assert(metrics.totalSuccesses === 1, 'Should have 1 success');
  console.assert(metrics.totalFailures === 3, 'Should have 3 failures');
  console.assert(metrics.totalRejections === 1, 'Should have 1 rejection');

  // Test reset
  breaker.reset();
  console.log('6. After reset, state:', breaker.getState());
  console.assert(breaker.getState() === CircuitState.CLOSED, 'Should be CLOSED after reset');

  // Test event emission
  let stateChangeEvent = false;
  breaker.on('state-change', () => {
    stateChangeEvent = true;
  });
  breaker.open();
  console.log('7. State change event emitted:', stateChangeEvent);
  console.assert(stateChangeEvent, 'Should emit state-change event');

  console.log('\n✅ All integration tests passed!');
}

main().catch((e) => {
  console.error('❌ Integration test failed:', e);
  process.exit(1);
});
