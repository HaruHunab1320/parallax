import { createValidator } from '@prism-lang/validator';

const validator = createValidator();

// Test 1: Simple object access
const test1 = `
export const test = (config) => {
  name = config.name
  return name
}
`;

// Test 2: With const
const test2 = `
export const test = (config) => {
  const name = config.name
  return name
}
`;

// Test 3: With bracket notation
const test3 = `
export const test = (config) => {
  const name = config["name"]
  return name
}
`;

console.log('Test 1 - Simple object access:');
let result = validator.validateAll(test1);
console.log('Valid:', result.valid);
if (!result.valid && result.formattedErrors) {
  console.log('Errors:', result.formattedErrors[0].message);
}

console.log('\nTest 2 - With const:');
result = validator.validateAll(test2);
console.log('Valid:', result.valid);
if (!result.valid && result.formattedErrors) {
  console.log('Errors:', result.formattedErrors[0].message);
}

console.log('\nTest 3 - With bracket notation:');
result = validator.validateAll(test3);
console.log('Valid:', result.valid);
if (!result.valid && result.formattedErrors) {
  console.log('Errors:', result.formattedErrors[0].message);
}