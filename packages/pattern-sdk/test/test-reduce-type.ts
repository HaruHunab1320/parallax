import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Simple reduce return',
    code: `nums = [1, 2, 3]
result = reduce(nums, (sum, n) => {
  return sum + n
}, 0)
result`
  },
  {
    name: 'Use reduce result',
    code: `nums = [1, 2, 3]
total = reduce(nums, (sum, n) => {
  return sum + n
}, 0)
// Use in math
doubled = total * 2`
  },
  {
    name: 'Inline calculation',
    code: `results = [{confidence: 0.8}, {confidence: 0.8}, {confidence: 0.8}]
// Don't use reduce, calculate manually
conf1 = results[0].confidence
conf2 = results[1].confidence  
conf3 = results[2].confidence
totalConfidence = conf1 + conf2 + conf3
avgConfidence = totalConfidence / 3`
  }
];

const validator = createValidator();

tests.forEach(test => {
  const result = validator.validateAll(test.code);
  console.log(`\n${test.name}: ${result.valid ? '✅' : '❌'}`);
  if (!result.valid && result.formattedErrors) {
    result.formattedErrors.forEach(err => {
      console.log(`  → Line ${err.line}: ${err.message}`);
    });
  }
});