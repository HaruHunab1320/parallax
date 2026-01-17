import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Simple reduce',
    code: `nums = [1, 2, 3]
total = reduce(nums, (sum, n) => sum + n, 0)`
  },
  {
    name: 'Object property access',
    code: `obj = {confidence: 0.8}
conf = obj.confidence`
  },
  {
    name: 'Reduce with object property',
    code: `results = [{confidence: 0.8}]
total = reduce(results, (sum, r) => {
  conf = r.confidence
  return sum + conf
}, 0)`
  }
];

const validator = createValidator();

tests.forEach(test => {
  const result = validator.validateAll(test.code);
  console.log(`\n${test.name}: ${result.valid ? '✅' : '❌'}`);
  if (!result.valid && result.formattedErrors) {
    result.formattedErrors.forEach(err => {
      console.log(`  Line ${err.line}: ${err.message}`);
    });
  }
});