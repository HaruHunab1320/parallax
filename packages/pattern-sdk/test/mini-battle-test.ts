/**
 * Mini Battle Test - Quick validation before full test suite
 */

import { BattleTestRunner, TEST_CASES } from './battle-test-suite';

async function runMiniTest() {
  console.log('🧪 Running Mini Battle Test (5 test cases)\n');
  
  // Select a few test cases from different categories
  const selectedTests = [
    TEST_CASES.find(tc => tc.id === 'simple-1')!,      // Basic parallel
    TEST_CASES.find(tc => tc.id === 'consensus-1')!,   // Simple consensus
    TEST_CASES.find(tc => tc.id === 'error-2')!,       // Fallback pattern
    TEST_CASES.find(tc => tc.id === 'complex-1')!,     // Complex multi-stage
    TEST_CASES.find(tc => tc.id === 'edge-1')!,        // Edge case
  ].filter(Boolean);
  
  console.log('Selected test cases:');
  selectedTests.forEach(tc => {
    console.log(`- ${tc.id}: ${tc.name} (${tc.category})`);
  });
  console.log('');
  
  // Temporarily replace TEST_CASES
  const originalTestCases = [...TEST_CASES];
  TEST_CASES.length = 0;
  TEST_CASES.push(...selectedTests);
  
  try {
    const runner = new BattleTestRunner();
    await runner.runAllTests();
  } finally {
    // Restore original test cases
    TEST_CASES.length = 0;
    TEST_CASES.push(...originalTestCases);
  }
}

runMiniTest().catch(console.error);