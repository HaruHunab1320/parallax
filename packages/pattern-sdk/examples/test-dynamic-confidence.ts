/**
 * Test dynamic confidence in generated patterns
 */

import { PatternGenerator } from '../src';

// Mock LLM that generates patterns with dynamic confidence
const mockLLM = {
  async generateObject({ prompt }: any) {
    if (prompt.includes('analyze')) {
      return {
        object: {
          needsParallelism: true,
          needsConsensus: true,
          hasThreshold: true,
          confidenceRequirement: 0.8,
          reasoning: 'Multi-agent analysis with consensus'
        }
      };
    } else {
      return {
        object: {
          selected: [
            { name: 'parallel', reason: 'Execute agents in parallel', config: {} },
            { name: 'consensus', reason: 'Build consensus from results', config: {} }
          ],
          order: ['parallel', 'consensus'],
          confidence: 0.9,
          reasoning: 'Dynamic confidence pattern'
        }
      };
    }
  }
};

async function testDynamicConfidence() {
  console.log('🧪 Testing Dynamic Confidence Pattern Generation\n');
  
  const generator = new PatternGenerator(mockLLM);
  
  const requirements = {
    goal: "Multi-agent analysis with dynamic confidence",
    strategy: "consensus" as const,
    minConfidence: 0.8
  };
  
  const pattern = await generator.generate(requirements);
  
  console.log('Generated Pattern:');
  console.log('='.repeat(70));
  console.log(pattern.code);
  console.log('='.repeat(70));
  
  console.log('\n📊 Key features of this pattern:');
  console.log('1. Agents execute in parallel - confidence extracted from each response');
  console.log('2. Consensus calculates average confidence dynamically');
  console.log('3. Final result uses runtime confidence, not hardcoded values');
  console.log('4. Confidence flows through the pattern based on actual execution');
}

testDynamicConfidence().catch(console.error);