import { readFileSync } from 'node:fs';
import { createValidator } from '@prism-lang/validator';

// Read a real pattern from the patterns directory
const patternCode = readFileSync(
  '/Users/jakobgrant/Workspaces/parallax/patterns/simple-consensus.prism',
  'utf8'
);

console.log('Validating simple-consensus.prism from patterns directory...\n');

const validator = createValidator();
const result = validator.validateAll(patternCode);

console.log('Valid:', result.valid ? '✅' : '❌');

if (!result.valid && result.formattedErrors) {
  console.log('\nErrors:');
  result.formattedErrors.forEach((err) => {
    console.log(`  Line ${err.line}: ${err.message}`);
  });
}
