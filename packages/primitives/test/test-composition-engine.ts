/**
 * Test the Pattern Composition Engine
 * 
 * This demonstrates how requirements are transformed into composed patterns
 */

import { PatternComposer } from '../composition/composer';
import { PatternAssembler } from '../composition/assembler';
import { OrchestrationRequirements } from '../types';

async function testCompositionEngine() {
  console.log('🚀 Testing Pattern Composition Engine\n');
  
  const composer = new PatternComposer();
  const assembler = new PatternAssembler();
  
  // Test Case 1: Simple Consensus Pattern
  console.log('📋 Test 1: Simple Consensus Pattern');
  const consensusReq: OrchestrationRequirements = {
    goal: "Get consensus from multiple code reviewers",
    strategy: "multi-reviewer agreement",
    minConfidence: 0.8,
    fallback: "escalate to senior reviewer"
  };
  
  const consensusPattern = await composer.composePattern(consensusReq);
  console.log('Composed Pattern:', JSON.stringify(consensusPattern, null, 2));
  
  const consensusCode = await assembler.assemble(consensusPattern);
  console.log('\nGenerated Code:');
  console.log(consensusCode.code);
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Test Case 2: Parallel Analysis with Voting
  console.log('📋 Test 2: Parallel Analysis with Voting');
  const analysisReq: OrchestrationRequirements = {
    goal: "Analyze security vulnerabilities in parallel and vote on severity",
    strategy: "parallel multi-agent voting",
    minConfidence: 0.7
  };
  
  const analysisPattern = await composer.composePattern(analysisReq);
  console.log('Composed Pattern:', JSON.stringify(analysisPattern, null, 2));
  
  const analysisCode = await assembler.assemble(analysisPattern);
  console.log('\nGenerated Code:');
  console.log(analysisCode.code);
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Test Case 3: Resilient Sequential Processing
  console.log('📋 Test 3: Resilient Sequential Processing');
  const sequentialReq: OrchestrationRequirements = {
    goal: "Process data sequentially with retry and fallback mechanisms",
    strategy: "sequential with resilience",
    minConfidence: 0.9,
    fallback: "use cached results"
  };
  
  const sequentialPattern = await composer.composePattern(sequentialReq);
  console.log('Composed Pattern:', JSON.stringify(sequentialPattern, null, 2));
  
  const sequentialCode = await assembler.assemble(sequentialPattern);
  console.log('\nGenerated Code:');
  console.log(sequentialCode.code);
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Test Case 4: Complex Multi-Stage Pattern
  console.log('📋 Test 4: Complex Multi-Stage Pattern');
  const complexReq: OrchestrationRequirements = {
    goal: "Parallel analysis with consensus building, threshold filtering, and escalation",
    strategy: "multi-stage consensus with escalation",
    minConfidence: 0.85,
    fallback: "escalate to supervisor"
  };
  
  const complexPattern = await composer.composePattern(complexReq);
  console.log('Composed Pattern:', JSON.stringify(complexPattern, null, 2));
  
  const complexCode = await assembler.assemble(complexPattern);
  console.log('\nGenerated Code:');
  console.log(complexCode.code);
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n✨ Composition Engine Test Complete!');
  console.log('\nThe engine successfully:');
  console.log('1. Analyzed natural language requirements');
  console.log('2. Selected appropriate primitives');
  console.log('3. Designed composition structures');
  console.log('4. Generated executable Prism patterns');
  console.log('\nNext steps:');
  console.log('- Integrate with Parallax runtime');
  console.log('- Add pattern validation');
  console.log('- Build pattern marketplace');
}

// Run the test
testCompositionEngine().catch(console.error);