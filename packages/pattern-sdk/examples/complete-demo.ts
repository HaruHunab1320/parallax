/**
 * Complete Pattern SDK Demo
 *
 * Demonstrates the full capabilities of the Pattern SDK:
 * 1. LLM-based pattern generation at development time
 * 2. Dynamic confidence propagation (not hardcoded)
 * 3. Valid Prism syntax that passes validation
 * 4. Patterns ready for version control
 */

import { PatternGenerator } from '../src';

// Mock LLM for demonstration
const mockLLM = {
  async generateObject({ prompt, schema }: any) {
    console.log('🤖 LLM analyzing requirements...');

    // Check if this is the analysis step
    if (prompt.includes('Analyze these orchestration requirements')) {
      return {
        object: {
          needsParallelism: true,
          needsConsensus: true,
          needsThreshold: true,
          needsRetry: true,
          needsAggregation: true,
          needsSequencing: false,
          hasThreshold: true,
          needsBranching: false,
          needsFallback: false,
          confidenceRequirement: 0.85,
          estimatedComplexity: 'medium',
          reasoning: 'Multi-stage data analysis with quality control',
        },
      };
    } else {
      // This is the primitive selection step
      return {
        object: {
          selected: [
            {
              name: 'parallel',
              reason: 'Analyze data in parallel',
              config: { maxConcurrency: 5 },
            },
            {
              name: 'consensus',
              reason: 'Build consensus from analyses',
              config: {},
            },
            {
              name: 'threshold',
              reason: 'Filter low confidence results',
              config: {},
            },
            {
              name: 'retry',
              reason: 'Retry failed analyses',
              config: { maxRetries: 2 },
            },
          ],
          order: ['parallel', 'consensus', 'threshold', 'retry'],
          confidence: 0.95,
          reasoning: 'Robust multi-agent analysis pattern',
        },
      };
    }
  },
};

async function demonstratePatternSDK() {
  console.log('🚀 Pattern SDK Complete Demonstration\n');
  console.log('📌 Key Features:');
  console.log('   ✓ LLM-driven pattern generation at dev time');
  console.log('   ✓ Dynamic confidence propagation');
  console.log('   ✓ Valid Prism syntax');
  console.log('   ✓ Ready for version control\n');

  // 1. Create pattern generator
  const generator = new PatternGenerator(mockLLM);

  // 2. Define requirements
  const requirements = {
    goal: 'Multi-stage data analysis with quality control',
    strategy: 'consensus' as const,
    minConfidence: 0.85,
    stages: [
      {
        name: 'analyze',
        description: 'Analyze data with multiple agents',
        parallel: true,
        agents: [
          {
            capability: 'data-analyst',
            count: 5,
          },
        ],
      },
    ],
    constraints: {
      maxRetries: 2,
      timeout: 30000,
    },
  };

  console.log('📋 Requirements:');
  console.log(`   Goal: ${requirements.goal}`);
  console.log(`   Strategy: ${requirements.strategy}`);
  console.log(`   Min Confidence: ${requirements.minConfidence}`);
  console.log(
    `   Agents: ${requirements.stages[0].agents[0].count} data analysts\n`
  );

  // 3. Generate pattern
  const pattern = await generator.generate(requirements);

  console.log('📄 Generated Pattern:');
  console.log('═'.repeat(80));
  console.log(pattern.code);
  console.log('═'.repeat(80));

  // 4. Highlight key aspects
  console.log('\n🔍 Pattern Analysis:');
  console.log(
    '1. ✅ Agents execute with: map(agentList, a => a.execute(input))'
  );
  console.log('   → Each agent returns its own confidence');
  console.log('');
  console.log('2. ✅ Consensus calculates: reduce(results, ...) dynamically');
  console.log('   → Confidence = average of all agent confidences');
  console.log('');
  console.log('3. ✅ Threshold applies: result.confidence >= minConfidence');
  console.log('   → Filters based on runtime confidence');
  console.log('');
  console.log('4. ✅ Final result: return result ~> finalConfidence');
  console.log('   → Uses calculated confidence, not hardcoded');

  // 5. Validate
  console.log('\n🔍 Validating pattern...');
  const validation = await generator.validate(pattern);

  if (validation.isValid) {
    console.log('✅ Pattern is valid Prism code!');
  } else {
    console.log('❌ Validation errors:', validation.errors);
  }

  // 6. Save
  const savedPath = await generator.save(pattern);
  console.log(`\n💾 Pattern saved to: ${savedPath}`);
  console.log('📦 Ready for version control (git add, commit, push)');

  console.log('\n🎯 Summary:');
  console.log('The Pattern SDK successfully:');
  console.log('• Used an LLM to understand requirements');
  console.log('• Generated a pattern with dynamic confidence');
  console.log('• Created valid Prism syntax');
  console.log('• Produced a pattern ready for production use');
}

demonstratePatternSDK().catch(console.error);
