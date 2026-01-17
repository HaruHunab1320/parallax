import { createValidator } from '@prism-lang/validator';

// Test basic Prism syntax to understand what works
const tests = [
  {
    name: 'Simple assignment',
    code: 'x = 5'
  },
  {
    name: 'Array literal',
    code: 'arr = [1, 2, 3]'
  },
  {
    name: 'Array length',
    code: `arr = [1, 2, 3]
len = arr.length`
  },
  {
    name: 'Array map as method',
    code: `arr = [1, 2, 3]
doubled = arr.map(x => x * 2)`
  },
  {
    name: 'Array reduce as method',
    code: `arr = [1, 2, 3]
sum = arr.reduce((acc, x) => acc + x, 0)`
  },
  {
    name: 'Object with methods',
    code: `obj = {
  value: 10,
  double: () => obj.value * 2
}`
  },
  {
    name: 'Function definition',
    code: `myFunc = (x) => x + 1`
  },
  {
    name: 'Pattern-like function',
    code: `pattern = (input) => {
  result = input * 2
  return result ~> 0.8
}`
  }
];

const validator = createValidator();

console.log('Learning Prism syntax...\n');

tests.forEach(test => {
  const result = validator.validateAll(test.code);
  console.log(`${test.name}: ${result.valid ? '✅' : '❌'}`);
  if (!result.valid && result.formattedErrors?.[0]) {
    console.log(`  → ${result.formattedErrors[0].message}`);
  }
});