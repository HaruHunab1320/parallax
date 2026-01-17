import { createValidator } from '@prism-lang/validator';

const validator = createValidator();

// Test property access
const testCode = `
export const test = (config) => {
  const val = config.agents || []
  return val
}
`;

console.log('Testing property access:');
const result = validator.validateAll(testCode);
console.log('Valid:', result.valid);
if (result.formattedErrors) {
  console.log('Errors:', result.formattedErrors);
}