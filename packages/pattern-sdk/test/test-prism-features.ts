import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Math.random()',
    code: 'x = Math.random()'
  },
  {
    name: 'Date.now()',
    code: 'x = Date.now()'
  },
  {
    name: 'String concatenation',
    code: 'x = "hello" + " world"'
  },
  {
    name: 'Arrow function',
    code: 'x = y => y + 1'
  },
  {
    name: 'Map function',
    code: 'x = [1,2,3].map(n => n * 2)'
  },
  {
    name: 'Reduce function',
    code: 'x = [1,2,3].reduce((sum, n) => sum + n, 0)'
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