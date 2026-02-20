/**
 * Standardized SDK Test for TypeScript
 * All SDKs must pass these exact same tests
 */

import { ParallaxAgent } from '@parallax/sdk-typescript';

// Test agent implementation
class TestAgent extends ParallaxAgent {
  constructor() {
    super(
      'test-agent-ts',
      'Test Agent (TypeScript)',
      ['analysis', 'validation'],
      { expertise: 0.85 }
    );
  }

  async analyze(task: string, input: any) {
    switch (task) {
      case 'analyze':
        return {
          value: {
            summary: `Analyzed ${input.data?.type || 'unknown'} content`,
            length: input.data?.content?.length || 0,
            result: 'Analysis complete'
          },
          confidence: 0.85,
          reasoning: 'Standard analysis performed'
        };

      case 'validate':
        const value = input.data?.value;
        const rules = input.data?.rules || [];
        const details: string[] = [];
        let valid = true;

        if (rules.includes('positive') && value > 0) {
          details.push('Value is positive');
        } else if (rules.includes('positive')) {
          valid = false;
          details.push('Value is not positive');
        }

        if (rules.includes('even') && value % 2 === 0) {
          details.push('Value is even');
        } else if (rules.includes('even')) {
          valid = false;
          details.push('Value is not even');
        }

        return {
          value: { valid, details },
          confidence: 0.95,
          reasoning: 'Validation rules applied'
        };

      default:
        throw new Error(`Unknown task: ${task}`);
    }
  }
}

// Run standardized tests
async function runStandardizedTests() {
  console.log('=== Parallax SDK Test Results ===');
  console.log('Language: TypeScript');
  console.log('SDK Version: 0.1.0\n');

  const results: Record<string, boolean> = {};

  // Test 1: Agent Creation
  try {
    const agent = new TestAgent();
    const passed = 
      agent.id === 'test-agent-ts' &&
      agent.capabilities.includes('analysis') &&
      agent.capabilities.includes('validation');
    results['Agent Creation'] = passed;
    console.log(`Test 1: Agent Creation............... ${passed ? 'PASS' : 'FAIL'}`);
  } catch (e: any) {
    results['Agent Creation'] = false;
    console.log(`Test 1: Agent Creation............... FAIL (${e.message})`);
  }

  // Test 2: Simple Analysis
  try {
    const agent = new TestAgent();
    const response = await agent.analyze('analyze', {
      data: {
        content: 'Test data for analysis',
        type: 'text'
      }
    });
    const passed = response.confidence >= 0.7 && !!response.value;
    results['Simple Analysis'] = passed;
    console.log(`Test 2: Simple Analysis.............. ${passed ? 'PASS' : 'FAIL'}`);
  } catch (e: any) {
    results['Simple Analysis'] = false;
    console.log(`Test 2: Simple Analysis.............. FAIL (${e.message})`);
  }

  // Test 3: Validation
  try {
    const agent = new TestAgent();
    const response = await agent.analyze('validate', {
      data: {
        value: 42,
        rules: ['positive', 'even']
      }
    });
    const passed = 
      response.value.valid === true &&
      response.confidence === 0.95 &&
      response.value.details.length === 2;
    results['Validation'] = passed;
    console.log(`Test 3: Validation................... ${passed ? 'PASS' : 'FAIL'}`);
  } catch (e: any) {
    results['Validation'] = false;
    console.log(`Test 3: Validation................... FAIL (${e.message})`);
  }

  // Test 4: Error Handling
  try {
    const agent = new TestAgent();
    await agent.analyze('unknown-task', {});
    results['Error Handling'] = false;
    console.log('Test 4: Error Handling............... FAIL (No error thrown)');
  } catch (e: any) {
    const passed = e.message.toLowerCase().includes('unknown task');
    results['Error Handling'] = passed;
    console.log(`Test 4: Error Handling............... ${passed ? 'PASS' : 'FAIL'}`);
  }

  // Test 5: Client API (optional) - skipped, ParallaxClient has been removed from the SDK
  console.log('Test 5: Client API (optional)........ SKIP (ParallaxClient not available)');

  // Summary
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  console.log(`\nSummary: ${passed}/${total} tests passed`);

  return passed === total;
}

// Run tests
runStandardizedTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });