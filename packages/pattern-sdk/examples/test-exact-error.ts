import { createValidator } from '@prism-lang/validator';
import fs from 'fs-extra';

const validator = createValidator();

// Read the actual generated pattern
const code = fs.readFileSync('examples/patterns/comprehensive-code-review-with-team-consensus.prism', 'utf8');

// Split into lines to find line 13
const lines = code.split('\n');
console.log('Line 13:', lines[12]); // 0-indexed
console.log('Line 14:', lines[13]);
console.log('Line 15:', lines[14]);

// Test just the problematic section
const testCode = lines.slice(0, 20).join('\n');
console.log('\nTesting first 20 lines:');
console.log(testCode);

const result = validator.validateAll(testCode);
console.log('\nValid:', result.valid);
if (result.formattedErrors) {
  console.log('Errors:', result.formattedErrors);
}