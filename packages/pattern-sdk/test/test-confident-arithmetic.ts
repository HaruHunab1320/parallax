import { createValidator } from '@prism-lang/validator';

const tests = [
  {
    name: 'Confident addition',
    code: `a = 5 ~> 0.9
b = 3 ~> 0.8
sum = a ~+ b`
  },
  {
    name: 'Confident division',
    code: `total = 15 ~> 0.9
count = 3
avg = total ~/ count`
  },
  {
    name: 'Confidence extraction',
    code: `value = 42 ~> 0.85
conf = <~ value`
  },
  {
    name: 'Reduce with confident ops',
    code: `nums = [1 ~> 0.9, 2 ~> 0.8, 3 ~> 0.7]
total = reduce(nums, (sum, n) => {
  return sum ~+ n
}, 0 ~> 1.0)`
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