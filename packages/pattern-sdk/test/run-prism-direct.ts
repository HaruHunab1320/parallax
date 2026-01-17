// Test Prism code directly through the runtime instead of just validation
import { Parser } from '@prism-lang/parser';
import { Runtime } from '@prism-lang/runtime';
import { createEnvironment } from '@prism-lang/core';

// Test the exact code that's failing validation
const testCases = [
  {
    name: 'Division after reduce',
    code: `
// Test reduce with division
results = [{confidence: 0.8}, {confidence: 0.9}, {confidence: 0.7}]
totalConfidence = reduce(results, (sum, r) => {
  return sum + r.confidence
}, 0)
count = 3
avgConfidence = totalConfidence / count
avgConfidence
`
  },
  {
    name: 'Type of reduce result',
    code: `
// What type does reduce return?
nums = [1, 2, 3]
sum = reduce(nums, (acc, n) => {
  return acc + n
}, 0)
// Try to use sum
doubled = sum * 2
divided = sum / 2
result = {
  sum: sum,
  doubled: doubled,
  divided: divided
}
result
`
  },
  {
    name: 'Our actual pattern code',
    code: `
// Simplified version of our pattern
tasks = ["task1", "task2", "task3"]
results = map(tasks, (t) => {
  return {
    task: t,
    confidence: 0.8
  }
})
totalConfidence = reduce(results, (sum, r) => {
  return sum + r.confidence
}, 0)
count = 3
avgConfidence = totalConfidence / count
avgConfidence
`
  }
];

async function testPrismCode() {
  const parser = new Parser();
  const runtime = new Runtime();
  
  console.log('Testing Prism code directly through runtime:\n');
  
  for (const test of testCases) {
    console.log(`=== ${test.name} ===`);
    
    try {
      // Parse the code
      const ast = parser.parse(test.code);
      
      // Create environment
      const env = createEnvironment();
      
      // Execute the code
      const result = await runtime.evaluate(ast, env);
      
      console.log('✅ Success!');
      console.log('Result:', result);
      
    } catch (error) {
      console.log('❌ Error:', error.message);
      if (error.stack) {
        console.log('Stack:', error.stack.split('\n')[1]);
      }
    }
    
    console.log('');
  }
}

testPrismCode().catch(console.error);