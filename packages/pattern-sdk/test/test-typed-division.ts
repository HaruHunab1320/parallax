import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Division after reduce',
    code: `nums = [1, 2, 3]
total = reduce(nums, (sum, n) => {
  return sum + n
}, 0)
count = 3
avg = total / count`
  },
  {
    name: 'Extract number first',
    code: `results = [{confidence: 0.8}, {confidence: 0.8}]
totalConfidence = reduce(results, (sum, r) => {
  return sum + r.confidence
}, 0)
// Extract to new variable
total = totalConfidence
count = 2
avgConfidence = total / count`
  },
  {
    name: 'Add zero to ensure number',
    code: `results = [{confidence: 0.8}]
totalConfidence = reduce(results, (sum, r) => {
  return sum + r.confidence
}, 0)
totalNum = totalConfidence + 0
count = 1
avgConfidence = totalNum / count`
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