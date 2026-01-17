import { createValidator } from '@prism-lang/validator';

// Test 1: Validate JSDoc pattern (like the ones in parallax/patterns)
const testPattern1 = `/**
 * @name TestPattern
 * @version 1.0.0
 * @description Test pattern
 */

// Pattern code
result = { value: "test" }
result ~> 1.0`;

// Test 2: Validate without JSDoc
const testPattern2 = `// Pattern code
result = { value: "test" }
result ~> 1.0`;

const validator = createValidator();

console.log('Testing pattern with JSDoc:');
const result1 = validator.validateAll(testPattern1);
console.log('Valid:', result1.valid);
if (result1.formattedErrors) {
  console.log('Errors:', result1.formattedErrors);
}

console.log('\nTesting pattern without JSDoc:');
const result2 = validator.validateAll(testPattern2);
console.log('Valid:', result2.valid);
if (result2.formattedErrors) {
  console.log('Errors:', result2.formattedErrors);
}