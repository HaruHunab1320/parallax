import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'map with explicit operations',
    code: `arr = [1, 2, 3]
doubled = map(arr, (x) => {
  two = 2
  return x * two
})`
  },
  {
    name: 'reduce with explicit operations',
    code: `arr = [1, 2, 3]
sum = reduce(arr, (acc, x) => {
  return acc + x
}, 0)`
  },
  {
    name: 'Check if map/reduce are built-in',
    code: `// Maybe they need to be defined?
myMap = (arr, fn) => {
  result = []
  // Prism might not have for loops
  return result
}
x = myMap([1,2,3], (n) => n * 2)`
  },
  {
    name: 'Object property access in reduce',
    code: `items = [{value: 10}, {value: 20}]
// Try without reduce first
first = items[0]
val = first.value`
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