import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Division test',
    code: `x = 3
y = x > 0 ? x / x : 0`
  },
  {
    name: 'Division with different vars',
    code: `totalConfidence = 2.4
resultsLength = 3
avgConfidence = resultsLength > 0 ? totalConfidence / resultsLength : 0`
  },
  {
    name: 'Reduce with arrow function',
    code: `results = [{confidence: 0.8}, {confidence: 0.9}]
totalConfidence = reduce(results, (sum, r) => sum + r.confidence, 0)`
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