import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Array.reduce method',
    code: `results = [{confidence: 0.8}, {confidence: 0.9}]
total = results.reduce((sum, r) => sum + r.confidence, 0)`
  },
  {
    name: 'Array.map method',
    code: `tasks = ["a", "b"]
results = tasks.map(t => t + "!")`
  },
  {
    name: 'Array.filter method',
    code: `nums = [1, 2, 3, 4]
evens = nums.filter(n => n % 2 == 0)`
  },
  {
    name: 'Array.length property',
    code: `arr = [1, 2, 3]
len = arr.length`
  }
];

const validator = createValidator();

tests.forEach(test => {
  const result = validator.validateAll(test.code);
  console.log(`${test.name}: ${result.valid ? '✅' : '❌'}`);
  if (!result.valid && result.formattedErrors) {
    console.log('  Error:', result.formattedErrors[0].message);
  }
});