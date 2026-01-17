import { createValidator } from '@prism-lang/validator';

const patternCode = `// Simple parallel pattern
parallelPattern = (input) => {
  // Process tasks
  tasks = ["a", "b", "c"]
  results = map(tasks, (t) => {
    return {
      task: t,
      confidence: 0.8
    }
  })
  
  // Calculate average confidence
  total = reduce(results, (sum, r) => {
    return sum + r.confidence
  }, 0)
  
  avg = total / 3
  
  // Return result with confidence
  return {
    results: results,
    avgConfidence: avg
  } ~> avg
}`;

const validator = createValidator();
const result = validator.validateAll(patternCode);

console.log('Valid:', result.valid ? '✅' : '❌');
if (!result.valid && result.formattedErrors) {
  console.log('\nErrors:');
  result.formattedErrors.forEach(err => {
    console.log(`  Line ${err.line}: ${err.message}`);
  });
}