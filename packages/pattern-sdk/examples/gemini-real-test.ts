/**
 * Test Pattern Generation with Real Gemini API
 * 
 * This example demonstrates using the Pattern SDK with Google's Gemini model
 * to generate real orchestration patterns.
 */

import { PatternGenerator } from '../src';
import { createGeminiProvider } from '../src/llm';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from the root .env file
config({ path: resolve(__dirname, '../../../.env') });

async function testGeminiPatternGeneration() {
  console.log('🚀 Testing Pattern SDK with Gemini API\n');
  
  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment variables');
    console.log('Please set GEMINI_API_KEY in your .env file');
    process.exit(1);
  }
  
  console.log('✅ Gemini API key found');
  console.log('🤖 Using model: gemini-2.0-flash-exp\n');
  
  // Create Gemini provider
  const geminiProvider = createGeminiProvider();
  
  // Create pattern generator
  const generator = new PatternGenerator(geminiProvider);
  
  // Test 1: Simple parallel processing pattern
  console.log('Test 1: Simple Parallel Processing Pattern');
  console.log('━'.repeat(50));
  
  try {
    const simplePattern = await generator.generate({
      goal: "Process customer feedback in parallel",
      strategy: "parallel",
      minConfidence: 0.7,
      stages: [{
        name: "analyze",
        description: "Analyze customer feedback sentiment",
        parallel: true,
        agents: [{
          capability: "sentiment-analysis",
          count: 3
        }]
      }]
    });
    
    console.log('Generated Pattern:');
    console.log(simplePattern.code);
    console.log('\nMetadata:', simplePattern.metadata);
    
    // Validate the pattern
    const validation = await generator.validate(simplePattern);
    console.log(`\nValidation: ${validation.isValid ? '✅ Valid' : '❌ Invalid'}`);
    if (!validation.isValid) {
      console.log('Errors:', validation.errors);
    }
    
    // Save the pattern
    const savedPath = await generator.save(simplePattern);
    console.log(`\nSaved to: ${savedPath}`);
    
  } catch (error) {
    console.error('Error generating simple pattern:', error);
  }
  
  // Test 2: Complex consensus pattern
  console.log('\n\nTest 2: Complex Consensus Pattern');
  console.log('━'.repeat(50));
  
  try {
    const complexPattern = await generator.generate({
      goal: "Multi-stage document review with expert consensus",
      strategy: "consensus",
      minConfidence: 0.85,
      stages: [
        {
          name: "initial-review",
          description: "Initial document analysis",
          parallel: true,
          agents: [{
            capability: "document-reviewer",
            count: 4
          }]
        },
        {
          name: "expert-review",
          description: "Expert validation of findings",
          parallel: false,
          agents: [{
            capability: "domain-expert",
            count: 2
          }]
        }
      ],
      constraints: {
        maxRetries: 2,
        timeout: 60000,
        requiredApprovals: 3
      },
      fallback: "senior-expert"
    });
    
    console.log('Generated Pattern:');
    console.log(complexPattern.code);
    console.log('\nPrimitives used:', complexPattern.metadata.primitives);
    console.log('Complexity:', complexPattern.metadata.complexity);
    
    // Validate
    const validation = await generator.validate(complexPattern);
    console.log(`\nValidation: ${validation.isValid ? '✅ Valid' : '❌ Invalid'}`);
    
    // Save
    const savedPath = await generator.save(complexPattern);
    console.log(`Saved to: ${savedPath}`);
    
  } catch (error) {
    console.error('Error generating complex pattern:', error);
  }
  
  // Test 3: Let Gemini be creative
  console.log('\n\nTest 3: Creative Pattern from Natural Language');
  console.log('━'.repeat(50));
  
  try {
    const creativePattern = await generator.generatePattern(
      `I need a pattern that can analyze code repositories for security vulnerabilities.
       It should use multiple specialized agents working in parallel for different types
       of vulnerabilities (SQL injection, XSS, authentication issues, etc). 
       The results should be aggregated with high confidence (at least 90%) and 
       any critical findings should trigger an immediate alert. 
       If confidence is low, escalate to a security expert for manual review.`,
      { temperature: 0.8 }
    );
    
    console.log('Generated from natural language:');
    console.log(creativePattern);
    
  } catch (error) {
    console.error('Error with natural language generation:', error);
  }
  
  console.log('\n✨ Testing complete!');
}

// Run the test
testGeminiPatternGeneration().catch(console.error);