import { createValidator } from '@prism-lang/validator';

// Test each part separately
const tests = [
  {
    name: 'String concatenation',
    code: `t = "task1"
result = "Processed: " + t`
  },
  {
    name: 'Object in map',
    code: `tasks = ["a", "b"]
results = map(tasks, (t) => {
  return {task: t}
})`
  },
  {
    name: 'Object with string concat',
    code: `tasks = ["a"]
results = map(tasks, (t) => {
  msg = "Processed: " + t
  return {
    task: t,
    result: msg
  }
})`
  },
  {
    name: 'Reduce with property access',
    code: `items = [{confidence: 0.8}]
total = reduce(items, (sum, item) => {
  conf = item.confidence
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
      console.log(`  → Line ${err.line}: ${err.message}`);
    });
  }
});