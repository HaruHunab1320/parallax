import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Basic reduce with numbers',
    code: `nums = [1, 2, 3]
sum = reduce(nums, (acc, n) => acc + n, 0)
sum`
  },
  {
    name: 'Reduce with inline expression',
    code: `results = [{confidence: 0.8}, {confidence: 0.9}]
totalConfidence = reduce(results, (sum, r) => sum + r.confidence, 0)
totalConfidence`
  },
  {
    name: 'Map with inline function',
    code: `tasks = ["task1", "task2"]
results = map(tasks, (t) => ({
  task: t,
  result: "Processed " + t,
  confidence: 0.8
}))
results`
  }
];

const validator = createValidator();

tests.forEach(test => {
  console.log(`\n=== ${test.name} ===`);
  const result = validator.validateAll(test.code);
  console.log(`Valid: ${result.valid ? '✅' : '❌'}`);
  
  if (!result.valid) {
    if (result.formattedErrors) {
      console.log('Formatted errors:');
      result.formattedErrors.forEach(err => {
        console.log(`  Line ${err.line}: ${err.message}`);
      });
    }
    
    if (result.errors) {
      console.log('Raw errors:', JSON.stringify(result.errors, null, 2));
    }
  }
});