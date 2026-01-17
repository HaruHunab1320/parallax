import { createValidator } from '@prism-lang/validator';

const patternCode = `// A working Prism pattern
myPattern = (input) => {
  // Extract data
  data = input
  
  // Process with map
  tasks = ["task1", "task2", "task3"]
  results = map(tasks, (t) => {
    return {
      task: t,
      result: "Processed: " + t,
      confidence: 0.8
    }
  })
  
  // Calculate total confidence
  totalConf = reduce(results, (sum, r) => {
    return sum + r.confidence
  }, 0)
  
  // Calculate average
  count = results.length
  avgConf = totalConf / count
  
  // Build result
  result = {
    taskCount: count,
    averageConfidence: avgConf,
    results: results
  }
  
  // Return with confidence
  return result ~> avgConf
}

// Test it
testInput = {data: "test"}
output = myPattern(testInput)
output`;

const validator = createValidator();
const result = validator.validateAll(patternCode);

console.log('Valid:', result.valid ? '✅' : '❌');
if (!result.valid && result.formattedErrors) {
  console.log('\nErrors:');
  result.formattedErrors.forEach(err => {
    console.log(`  Line ${err.line}: ${err.message}`);
  });
} else {
  console.log('\nPattern validates successfully!');
}