/**
 * Simple Pattern SDK Demo
 * 
 * Demonstrates generating a simple pattern using the Pattern SDK
 */

import { PatternGenerator } from '../src';

// Simple mock LLM provider
const mockLLM = {
  async generateObject({ prompt }: any) {
    // Return appropriate mock response based on prompt
    if (prompt.includes('analyze')) {
      return {
        object: {
          needsParallelism: true,
          needsSequencing: false,
          needsConsensus: false,
          needsAggregation: false,
          hasThreshold: true,
          needsBranching: false,
          needsRetry: false,
          needsFallback: false,
          confidenceRequirement: 0.8,
          estimatedComplexity: 'simple',
          reasoning: 'Simple parallel processing with confidence threshold'
        }
      };
    } else {
      return {
        object: {
          selected: [
            { name: 'parallel', reason: 'Process data concurrently', config: { maxConcurrency: 3 } },
            { name: 'threshold', reason: 'Filter by confidence', config: { min: 0.8 } }
          ],
          order: ['parallel', 'threshold'],
          confidence: 0.9,
          reasoning: 'Simple parallel processing pattern'
        }
      };
    }
  }
};

async function generateSimplePattern() {
  console.log('🚀 Pattern SDK Demo - Simple Multi-Agent Pattern\n');
  
  // Create pattern generator with mock LLM
  const generator = new PatternGenerator(mockLLM);
  
  // Define simple requirements
  const requirements = {
    goal: "Simple multi-agent data processing",
    strategy: "parallel" as const,
    minConfidence: 0.8,
    stages: [{
      name: "process",
      description: "Process data in parallel",
      parallel: true,
      agents: [{
        capability: "data-processor",
        count: 3
      }]
    }]
  };
  
  console.log('📋 Requirements:');
  console.log(`  Goal: ${requirements.goal}`);
  console.log(`  Strategy: ${requirements.strategy}`);
  console.log(`  Min Confidence: ${requirements.minConfidence}`);
  console.log('');
  
  // Generate the pattern
  const pattern = await generator.generate(requirements);
  
  console.log('📄 Generated Pattern:');
  console.log('═'.repeat(60));
  console.log(pattern.code);
  console.log('═'.repeat(60));
  
  // Validate the pattern
  console.log('\n🔍 Validating pattern...');
  const validation = await generator.validate(pattern);
  
  if (validation.isValid) {
    console.log('✅ Pattern is valid!');
  } else {
    console.log('❌ Pattern has issues:');
    validation.errors.forEach(err => console.log(`  Error: ${err.message}`));
  }
  
  // Save the pattern
  const savedPath = await generator.save(pattern);
  console.log(`\n💾 Pattern saved to: ${savedPath}`);
}

// Run the demo
generateSimplePattern().catch(console.error);