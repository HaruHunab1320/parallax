import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'map as standalone function',
    code: `arr = [1, 2, 3]
doubled = map(arr, x => x * 2)`
  },
  {
    name: 'reduce as standalone function',
    code: `arr = [1, 2, 3]
sum = reduce(arr, (acc, x) => acc + x, 0)`
  },
  {
    name: 'filter as standalone function',
    code: `arr = [1, 2, 3, 4]
evens = filter(arr, x => x % 2 == 0)`
  },
  {
    name: 'Simple function with typed param',
    code: `addOne = (x: number) => x + 1`
  },
  {
    name: 'Function without types',
    code: `addOne = (x) => {
  return x + 1
}`
  },
  {
    name: 'Confidence operator',
    code: `x = 42
y = x ~> 0.9`
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