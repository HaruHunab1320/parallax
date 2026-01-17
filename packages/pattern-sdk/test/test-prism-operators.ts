import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Null coalescing (??)',
    code: 'x = y ?? "default"'
  },
  {
    name: 'Optional chaining (?.)',
    code: 'x = obj?.prop'
  },
  {
    name: 'Logical OR (||)',
    code: 'x = y || "default"'
  },
  {
    name: 'Ternary operator',
    code: 'x = y > 0 ? y : 0'
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