import { PatternGenerator } from '../src';
import { createGeminiProvider } from '../src/llm';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../../../.env') });

async function debugPatternGeneration() {
  const generator = new PatternGenerator(createGeminiProvider());
  
  // Simple parallel test case
  const requirements = {
    goal: "Execute data processing tasks in parallel",
    strategy: "parallel",
    minConfidence: 0.7,
    agents: [{ capability: "processor", count: 3 }]
  };
  
  console.log('Generating pattern for:', requirements);
  
  try {
    const pattern = await generator.generate(requirements);
    
    console.log('\n=== Generated Pattern ===');
    console.log('Name:', pattern.name);
    console.log('Version:', pattern.version);
    console.log('Primitives:', pattern.metadata.primitives);
    console.log('\n=== Pattern Code ===');
    console.log(pattern.code);
    
    console.log('\n=== Validating Pattern ===');
    const validation = await generator.validate(pattern);
    console.log('Valid:', validation.isValid);
    
    if (!validation.isValid) {
      console.log('\nErrors:');
      validation.errors.forEach(err => {
        console.log(`- Line ${err.line || 'N/A'}: ${err.message}`);
      });
    }
    
    if (validation.warnings.length > 0) {
      console.log('\nWarnings:');
      validation.warnings.forEach(warn => {
        console.log(`- Line ${warn.line || 'N/A'}: ${warn.message}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugPatternGeneration();