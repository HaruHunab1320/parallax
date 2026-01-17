/**
 * Example: Generate a consensus pattern using the Pattern SDK
 */

import { PatternGenerator } from '../src';
import { OrchestrationRequirements } from '../src/types';

// Mock LLM provider for example
const mockLLM = {
  async generateObject({ prompt }: any) {
    console.log('LLM Prompt:', prompt);
    
    if (prompt.includes('analyze')) {
      return {
        object: {
          needsParallelism: true,
          needsSequencing: false,
          needsConsensus: true,
          needsAggregation: true,
          hasThreshold: true,
          needsBranching: false,
          needsRetry: true,
          needsFallback: true,
          confidenceRequirement: 0.9,
          estimatedComplexity: 'medium',
          reasoning: 'Code review requires consensus among multiple reviewers'
        }
      };
    } else {
      return {
        object: {
          selected: [
            { name: 'parallel', reason: 'Review by multiple agents concurrently', config: { maxConcurrency: 3 } },
            { name: 'consensus', reason: 'Reach agreement on review findings', config: { threshold: 0.8 } },
            { name: 'threshold', reason: 'Ensure high confidence in results', config: { min: 0.9 } },
            { name: 'retry', reason: 'Retry failed reviews', config: { maxAttempts: 2 } },
            { name: 'fallback', reason: 'Escalate to senior reviewer if needed', config: { to: 'senior-engineer' } }
          ],
          order: ['parallel', 'consensus', 'threshold', 'retry', 'fallback'],
          confidence: 0.95,
          reasoning: 'Comprehensive code review pattern with quality safeguards'
        }
      };
    }
  }
};

async function main() {
  console.log('🎯 Generating Code Review Consensus Pattern\n');
  
  // Define requirements
  const requirements: OrchestrationRequirements = {
    goal: 'Comprehensive code review with team consensus',
    strategy: 'consensus',
    minConfidence: 0.9,
    fallback: 'senior-engineer',
    stages: [
      {
        name: 'initial-review',
        description: 'Initial code analysis by multiple reviewers',
        parallel: true,
        agents: [
          { capability: 'code-review', count: 3 }
        ]
      },
      {
        name: 'security-check',
        description: 'Security-focused review',
        condition: 'hasSecurityConcerns',
        agents: [
          { capability: 'security-review', count: 2 }
        ]
      }
    ],
    constraints: {
      maxReviewTime: 3600, // 1 hour
      requiredApprovals: 2,
      blockOnCritical: true
    }
  };
  
  // Initialize generator
  const generator = new PatternGenerator({
    llm: mockLLM,
    outputDir: './examples/patterns'
  });
  
  try {
    // Generate pattern
    console.log('📝 Analyzing requirements...');
    const pattern = await generator.generate(requirements);
    
    console.log('\n✅ Pattern generated successfully!\n');
    console.log('Pattern Details:');
    console.log('- Name:', pattern.name);
    console.log('- Version:', pattern.version);
    console.log('- Primitives:', pattern.metadata.primitives.join(', '));
    console.log('- Complexity:', pattern.metadata.complexity);
    console.log('- Estimated Agents:', pattern.metadata.estimatedAgents);
    
    console.log('\n📄 Generated Prism Code:');
    console.log('─'.repeat(60));
    console.log(pattern.code);
    console.log('─'.repeat(60));
    
    // Save pattern
    const savedPath = await generator.save(pattern);
    console.log('\n💾 Pattern saved to:', savedPath);
    
    // Validate pattern
    console.log('\n🔍 Validating pattern...');
    const validation = await generator.validate(pattern);
    
    if (validation.isValid) {
      console.log('✅ Pattern is valid!');
    } else {
      console.log('❌ Pattern has validation issues:');
      validation.errors.forEach(err => console.log('  Error:', err.message));
    }
    
    if (validation.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      validation.warnings.forEach(warn => console.log('  -', warn.message));
    }
    
    if (validation.suggestions.length > 0) {
      console.log('\n💡 Suggestions:');
      validation.suggestions.forEach(sug => console.log('  -', sug));
    }
    
  } catch (error) {
    console.error('❌ Error generating pattern:', error);
    process.exit(1);
  }
}

// Run example
main().catch(console.error);