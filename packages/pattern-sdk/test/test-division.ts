import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Direct division',
    code: `x = 6 / 3`
  },
  {
    name: 'Variable division',
    code: `total = 6
count = 3
avg = total / count`
  },
  {
    name: 'Division with literal',
    code: `total = 6
avg = total / 3`
  },
  {
    name: 'Cast to number?',
    code: `total = 6
three = 3
avg = total / three`
  }
];

const validator = createValidator();

tests.forEach(test => {
  const result = validator.validateAll(test.code);
  console.log(`${test.name}: ${result.valid ? '✅' : '❌'}`);
  if (!result.valid && result.formattedErrors?.[0]) {
    console.log(`  → ${result.formattedErrors[0].message}`);
  }
});