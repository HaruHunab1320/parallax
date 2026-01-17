import { createValidator } from '@prism-lang/validator';

const validator = createValidator();

// Test 1: Simple float
const test1 = `
export const test = () => {
  const num = 0.9
  return num
}
`;

// Test 2: Float in expression
const test2 = `
export const test = (config) => {
  const num = config.value || 0.9
  return num
}
`;

// Test 3: Integer
const test3 = `
export const test = (config) => {
  const num = config.value || 1
  return num
}
`;

console.log('Test 1 - Simple float:');
let result = validator.validateAll(test1);
console.log('Valid:', result.valid);
if (!result.valid && result.formattedErrors) {
  console.log('Error:', result.formattedErrors[0].message);
}

console.log('\nTest 2 - Float in expression:');
result = validator.validateAll(test2);
console.log('Valid:', result.valid);
if (!result.valid && result.formattedErrors) {
  console.log('Error:', result.formattedErrors[0].message);
}

console.log('\nTest 3 - Integer:');
result = validator.validateAll(test3);
console.log('Valid:', result.valid);
if (!result.valid && result.formattedErrors) {
  console.log('Error:', result.formattedErrors[0].message);
}