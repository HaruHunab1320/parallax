import { createValidator } from '@prism-lang/validator';

const validator = createValidator();

// Test simple arrow function
const testCode1 = `
export const test = () => {
  return "hello"
}
`;

// Test arrow function with parameter
const testCode2 = `
export const test = (config) => {
  return config
}
`;

// Test nested arrow function
const testCode3 = `
export const test = (config) => {
  return (input) => {
    return input
  }
}
`;

console.log('Test 1 - Simple arrow function:');
try {
  const result = validator.validateAll(testCode1);
  console.log('Valid:', result.valid);
  if (result.formattedErrors) {
    console.log('Errors:', result.formattedErrors);
  }
} catch (e) {
  console.error('Error:', e.message);
}

console.log('\nTest 2 - Arrow function with parameter:');
try {
  const result = validator.validateAll(testCode2);
  console.log('Valid:', result.valid);
  if (result.formattedErrors) {
    console.log('Errors:', result.formattedErrors);
  }
} catch (e) {
  console.error('Error:', e.message);
}

console.log('\nTest 3 - Nested arrow function:');
try {
  const result = validator.validateAll(testCode3);
  console.log('Valid:', result.valid);
  if (result.formattedErrors) {
    console.log('Errors:', result.formattedErrors);
  }
} catch (e) {
  console.error('Error:', e.message);
}