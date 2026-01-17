import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Null coalescing (??)',
    code: `y = null
x = y ?? "default"`
  },
  {
    name: 'Logical OR (||)',  
    code: `y = null
x = y || "default"`
  },
  {
    name: 'Ternary operator',
    code: `y = 5
x = y > 0 ? y : 0`
  }
];

const validator = createValidator();

tests.forEach(test => {
  const result = validator.validateAll(test.code);
  console.log(`${test.name}: ${result.valid ? '✅' : '❌'}`);
  if (!result.valid && result.formattedErrors) {
    result.formattedErrors.forEach(err => {
      console.log('  Error:', err.message);
    });
  }
});