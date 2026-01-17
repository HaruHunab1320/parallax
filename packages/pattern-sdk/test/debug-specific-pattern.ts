import { createValidator } from '@prism-lang/validator';

const patternCode = `// Pattern Metadata
// Name: ExecuteDataProcessingTasksInParallel
// Version: 1.0.0
// Description: Execute data processing tasks in parallel
// Agent Capabilities: processor
// Minimum Agents: 3

ExecuteDataProcessingTasksInParallelPattern = (input) => {
  // Extract input data
  data = input
  task = "Execute data processing tasks in parallel"
  minConfidence = 0.7

  // Execute tasks in parallel
  // In real usage, this would use actual parallel primitive
  tasks = ["task1", "task2", "task3"]

  // Simulate parallel execution with map
  results = map(tasks, (t) => ({
    task: t,
    result: "Processed " + t,
    confidence: 0.8
  }))

  // Calculate metrics
  totalConfidence = reduce(results, (sum, r) => sum + r.confidence, 0)
  resultsLength = 3 // Known length for this example
  avgConfidence = resultsLength > 0 ? totalConfidence / resultsLength : 0

  // Build result
  result = {
    executionType: "parallel",
    taskCount: resultsLength,
    averageConfidence: avgConfidence,
    results: results
  }

  // Return with average confidence
  return result ~> avgConfidence
}

// Export the pattern
ExecuteDataProcessingTasksInParallelPattern`;

const validator = createValidator();
const result = validator.validateAll(patternCode);

console.log('Valid:', result.valid);
if (result.formattedErrors) {
  console.log('\nErrors:');
  result.formattedErrors.forEach(err => {
    console.log(`Line ${err.line}: ${err.message}`);
  });
}

// Also check syntax
if (result.syntax?.errors) {
  console.log('\nSyntax errors:');
  result.syntax.errors.forEach(err => {
    console.log(`Line ${err.line}: ${err.message}`);
  });
}