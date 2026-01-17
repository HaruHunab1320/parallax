import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Direct arithmetic',
    code: `x = 2 + 3`
  },
  {
    name: 'Variable arithmetic',
    code: `x = 2
y = 3
z = x + y`
  },
  {
    name: 'Function with literal arithmetic',
    code: `add = (x) => {
  return 1 + 2
}`
  },
  {
    name: 'map with literal return',
    code: `arr = [1, 2, 3]
doubled = map(arr, (x) => 6)`
  },
  {
    name: 'Working through the types',
    code: `// Start with known numbers
a = 5
b = 10
// Add them
c = a + b
// Use in function
doubleIt = (n) => {
  two = 2
  return n * two
}`
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