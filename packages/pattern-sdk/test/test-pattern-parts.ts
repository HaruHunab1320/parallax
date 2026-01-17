import { createValidator } from '@prism-lang/validator';

// Test just the inner logic
const code = `// Execute tasks in parallel
tasks = ["task1", "task2", "task3"]

// Simulate parallel execution with map
results = map(tasks, (t) => {
  msg = "Processed " + t
  return {
    task: t,
    result: msg,
    confidence: 0.8
  }
})

// Calculate metrics
totalConfidence = reduce(results, (sum, r) => {
  return sum + r.confidence
}, 0)
count = 3
avgConfidence = totalConfidence / count

// Build result
result = {
  executionType: "parallel",
  taskCount: count,
  averageConfidence: avgConfidence,
  results: results
}

// Return with average confidence
finalResult = result ~> avgConfidence`;

const validator = createValidator();
const result = validator.validateAll(code);

console.log('Valid:', result.valid ? '✅' : '❌');
if (!result.valid && result.formattedErrors) {
  console.log('\nErrors:');
  result.formattedErrors.forEach(err => {
    console.log(`  Line ${err.line}: ${err.message}`);
  });
}