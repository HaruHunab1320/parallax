/**
 * Circuit Breaker Demo
 *
 * Demonstrates the circuit breaker with a flaky service that fails intermittently.
 * Run with: npx tsx demo/demo.ts
 */

import { CircuitBreaker } from '../src';

// Simulate a flaky service
let callCount = 0;
async function flakyService(): Promise<string> {
  callCount++;
  // Fail on calls 3, 4, 5 to trigger circuit opening
  if (callCount >= 3 && callCount <= 5) {
    throw new Error(`Service failure #${callCount}`);
  }
  return `Success #${callCount}`;
}

async function main() {
  console.log('=== Circuit Breaker Demo ===\n');

  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 2000, // 2 seconds
    halfOpenMaxCalls: 1,
  });

  // Subscribe to state changes
  breaker.on('stateChange', ({ from, to }) => {
    console.log(`  [STATE CHANGE] ${from} -> ${to}`);
  });

  breaker.on('failure', ({ error }) => {
    console.log(`  [FAILURE] ${error.message}`);
  });

  breaker.on('success', () => {
    console.log(`  [SUCCESS]`);
  });

  // Make 10 calls
  for (let i = 1; i <= 10; i++) {
    console.log(`\nCall ${i}:`);

    try {
      const result = await breaker.execute(flakyService);
      console.log(`  Result: ${result}`);
    } catch (error) {
      console.log(`  Error: ${(error as Error).message}`);
    }

    console.log(`  Circuit state: ${breaker.getState()}`);

    // Wait a bit between calls
    if (breaker.getState() === 'OPEN') {
      console.log('  Waiting 2.5s for circuit to half-open...');
      await new Promise(r => setTimeout(r, 2500));
    } else {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log('\n=== Demo Complete ===');
  console.log('The circuit breaker opened after 3 failures, then recovered.\n');
}

main().catch(console.error);
