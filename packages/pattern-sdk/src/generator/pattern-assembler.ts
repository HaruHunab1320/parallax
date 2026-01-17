/**
 * Pattern Assembler - Converts selected primitives into executable Prism code
 */

import { OrchestrationRequirements, PrimitiveDefinition } from '../types';

export class PatternAssembler {
  constructor(private primitives: Map<string, PrimitiveDefinition>) {}

  /**
   * Assemble pattern code from selected primitives
   */
  async assemble(
    requirements: OrchestrationRequirements,
    selectedPrimitives: any[],
    order: string[]
  ): Promise<string> {
    const sections: string[] = [];
    
    // Generate header comments
    sections.push(this.generateJSDocHeader(requirements));
    sections.push('');
    
    // Generate the pattern as a function that takes input
    const functionName = this.formatPatternName(requirements.goal) + 'Pattern';
    sections.push(`${functionName} = (input) => {`);
    
    // Generate pattern logic inside the function
    const patternLogic = this.generatePatternLogic(requirements, selectedPrimitives, order);
    const indentedLogic = patternLogic.split('\n').map(line => line ? '  ' + line : '').join('\n');
    sections.push(indentedLogic);
    
    sections.push('}');
    sections.push('');
    sections.push(`// Export the pattern`);
    sections.push(`${functionName}`);
    
    return sections.join('\n');
  }

  /**
   * Generate header comments for pattern (without JSDoc @ annotations)
   */
  private generateJSDocHeader(requirements: OrchestrationRequirements): string {
    const lines: string[] = [];
    
    // Generate pattern name from goal
    const patternName = this.formatPatternName(requirements.goal);
    
    // Use regular comments instead of JSDoc to avoid validator issues
    lines.push('// Pattern Metadata');
    lines.push(`// Name: ${patternName}`);
    lines.push('// Version: 1.0.0');
    lines.push(`// Description: ${requirements.goal}`);
    
    // Agent requirements if specified
    if (requirements.agents && requirements.agents.length > 0) {
      const capabilities = requirements.agents.map(a => a.capability).filter(Boolean);
      if (capabilities.length > 0) {
        lines.push(`// Agent Capabilities: ${capabilities.join(', ')}`);
      }
    }
    
    // Min agents
    const minAgents = this.calculateMinAgents(requirements);
    lines.push(`// Minimum Agents: ${minAgents}`);
    
    return lines.join('\n');
  }
  
  /**
   * Calculate minimum agents needed
   */
  private calculateMinAgents(requirements: OrchestrationRequirements): number {
    if (requirements.agents && requirements.agents.length > 0) {
      return requirements.agents.reduce((sum, agent) => sum + (agent.count || 1), 0);
    }
    // Default based on strategy
    if (requirements.strategy === 'consensus') return 3;
    if (requirements.strategy === 'parallel') return 2;
    return 1;
  }
  
  /**
   * Format pattern name from goal
   */
  private formatPatternName(goal: string): string {
    // Convert goal to PascalCase pattern name
    return goal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }


  /**
   * Generate pattern logic based on primitives
   */
  private generatePatternLogic(
    requirements: OrchestrationRequirements,
    selectedPrimitives: any[],
    order: string[]
  ): string {
    const lines: string[] = [];
    
    // Initialize variables from input
    lines.push(`// Extract input data`);
    lines.push(`data = input`);
    lines.push(`task = "${requirements.goal}"`);
    
    if (requirements.minConfidence) {
      lines.push(`minConfidence = ${requirements.minConfidence}`);
    }
    lines.push('');
    
    // Generate pattern based on primary strategy
    const primaryPrimitive = selectedPrimitives[0]?.name || requirements.strategy;
    
    switch (primaryPrimitive) {
      case 'consensus':
        lines.push(...this.generateConsensusPattern(requirements));
        break;
      case 'parallel':
        lines.push(...this.generateParallelPattern(requirements));
        break;
      case 'retry':
      case 'fallback':
        lines.push(...this.generateRobustPattern(requirements, selectedPrimitives));
        break;
      case 'threshold':
        lines.push(...this.generateThresholdPattern(requirements));
        break;
      default:
        lines.push(...this.generateGenericPattern(requirements, selectedPrimitives));
    }
    
    return lines.join('\n');
  }

  /**
   * Generate consensus pattern
   */
  private generateConsensusPattern(requirements: OrchestrationRequirements): string[] {
    const lines: string[] = [];
    
    // For consensus, we need multiple results to aggregate
    lines.push('// Simulate multiple agent responses for consensus');
    lines.push('// In real usage, this would come from actual agent calls');
    lines.push('responses = [');
    lines.push('  { result: "Response 1", confidence: 0.8 },');
    lines.push('  { result: "Response 2", confidence: 0.9 },');
    lines.push('  { result: "Response 3", confidence: 0.7 }');
    lines.push(']');
    lines.push('');
    
    lines.push('// Calculate consensus');
    lines.push('totalConfidence = reduce(responses, (sum, r) => {');
    lines.push('  return sum + r.confidence');
    lines.push('}, 0)');
    lines.push('responseCount = 3');
    lines.push('avgConfidence = totalConfidence / responseCount');
    lines.push('');
    
    const threshold = requirements.minConfidence || 0.7;
    lines.push('// Determine consensus status');
    lines.push(`consensusReached = avgConfidence > ${threshold}`);
    lines.push('');
    
    // Build result
    lines.push('// Build result');
    lines.push('result = {');
    lines.push('  status: consensusReached ? "consensus_reached" : "low_consensus",');
    lines.push('  confidence: avgConfidence,');
    lines.push('  responses: responses,');
    lines.push('  threshold: ' + threshold);
    lines.push('}');
    lines.push('');
    
    lines.push('// Return result with confidence');
    lines.push('return result ~> avgConfidence');
    
    return lines;
  }
  
  /**
   * Generate parallel pattern
   */
  private generateParallelPattern(requirements: OrchestrationRequirements): string[] {
    const lines: string[] = [];
    
    lines.push('// Execute tasks in parallel');
    lines.push('// In real usage, this would use actual parallel primitive');
    lines.push('tasks = ["task1", "task2", "task3"]');
    lines.push('');
    
    lines.push('// Simulate parallel execution with map');
    lines.push('results = map(tasks, (t) => {');
    lines.push('  msg = "Processed " + t');
    lines.push('  return {');
    lines.push('    task: t,');
    lines.push('    result: msg,');
    lines.push('    confidence: 0.8');
    lines.push('  }');
    lines.push('})');
    lines.push('');
    
    // Calculate aggregate metrics
    lines.push('// Calculate metrics');
    lines.push('count = 3');
    lines.push('// Regular reduce since we extract confidence values');
    lines.push('totalConfidence = reduce(results, (sum, r) => {');
    lines.push('  return sum + r.confidence');
    lines.push('}, 0)');
    lines.push('// Regular division for confidence values');
    lines.push('avgConfidence = totalConfidence / count');
    lines.push('');
    
    // Build result
    lines.push('// Build result');
    lines.push('result = {');
    lines.push('  executionType: "parallel",');
    lines.push('  taskCount: count,');
    lines.push('  averageConfidence: avgConfidence,');
    lines.push('  results: results');
    lines.push('}');
    lines.push('');
    
    lines.push('// Return with average confidence');
    lines.push('return result ~> avgConfidence');
    
    return lines;
  }
  
  /**
   * Generate robust pattern (retry/fallback)
   */
  private generateRobustPattern(requirements: OrchestrationRequirements, primitives: any[]): string[] {
    const lines: string[] = [];
    
    lines.push('// Simulate initial attempt');
    lines.push('attempt1 = {');
    lines.push('  result: "Initial attempt",');
    lines.push('  confidence: 0.4 // Low confidence to trigger retry/fallback');
    lines.push('}');
    lines.push('');
    
    const hasRetry = primitives.some(p => p.name === 'retry');
    const hasFallback = primitives.some(p => p.name === 'fallback');
    
    lines.push('// Check if recovery needed');
    lines.push('needsRecovery = attempt1.confidence < 0.6');
    lines.push('');
    
    if (hasRetry) {
      lines.push('// Retry logic');
      lines.push('finalResult = needsRecovery ? {');
      lines.push('  result: "Retried successfully",');
      lines.push('  confidence: 0.8,');
      lines.push('  attempts: 2');
      lines.push('} : attempt1');
    } else if (hasFallback) {
      lines.push('// Fallback logic');
      lines.push('finalResult = needsRecovery ? {');
      lines.push('  result: "Fallback executed",');
      lines.push('  confidence: 0.9,');
      lines.push('  strategy: "fallback"');
      lines.push('} : attempt1');
    } else {
      lines.push('finalResult = attempt1');
    }
    
    lines.push('');
    lines.push('// Build result');
    lines.push('result = {');
    lines.push('  strategy: needsRecovery ? "recovery_executed" : "first_attempt_succeeded",');
    lines.push('  output: finalResult.result,');
    lines.push('  confidence: finalResult.confidence,');
    lines.push('  recoveryUsed: needsRecovery');
    lines.push('}');
    lines.push('');
    
    lines.push('// Return with final confidence');
    lines.push('return result ~> finalResult.confidence');
    
    return lines;
  }
  
  /**
   * Generate threshold pattern
   */
  private generateThresholdPattern(requirements: OrchestrationRequirements): string[] {
    const lines: string[] = [];
    
    const threshold = requirements.minConfidence || 0.7;
    
    lines.push('// Test data with varying confidence');
    lines.push('candidates = [');
    lines.push('  { result: "Option A", confidence: 0.9 },');
    lines.push('  { result: "Option B", confidence: 0.6 },');
    lines.push('  { result: "Option C", confidence: 0.8 }');
    lines.push(']');
    lines.push('');
    
    lines.push('// Apply threshold filter');
    lines.push(`threshold = ${threshold}`);
    lines.push('passingResults = filter(candidates, (r) => {');
    lines.push('  return r.confidence >= threshold');
    lines.push('})');
    lines.push('');
    
    lines.push('// Check if any passed threshold');
    lines.push('passingCount = reduce(passingResults, (count, r) => {');
    lines.push('  return count + 1');
    lines.push('}, 0)');
    lines.push('thresholdMet = passingCount > 0');
    lines.push('');
    
    lines.push('// Select best from passing results');
    lines.push('bestResult = null');
    lines.push('if (thresholdMet) {');
    lines.push('  bestResult = reduce(passingResults, (best, current) => {');
    lines.push('    return current.confidence > best.confidence ? current : best');
    lines.push('  }, passingResults[0])');
    lines.push('}');
    lines.push('');
    
    lines.push('// Build result');
    lines.push('result = {');
    lines.push('  thresholdMet: thresholdMet,');
    lines.push('  threshold: threshold,');
    lines.push('  passingCount: passingCount,');
    lines.push('  totalCount: 3,');
    lines.push('  selectedResult: bestResult ? bestResult.result : null,');
    lines.push('  confidence: bestResult ? bestResult.confidence : 0');
    lines.push('}');
    lines.push('');
    
    lines.push('// Return with appropriate confidence');
    lines.push('return result ~> (bestResult ? bestResult.confidence : 0)');
    
    return lines;
  }
  
  /**
   * Generate generic pattern
   */
  private generateGenericPattern(requirements: OrchestrationRequirements, _primitives: any[]): string[] {
    const lines: string[] = [];
    
    lines.push('// Generic pattern - process input');
    lines.push('// This is a simple pass-through with confidence');
    lines.push('');
    
    lines.push('// Process the input');
    lines.push('processedResult = {');
    lines.push('  task: task,');
    lines.push('  input: data,');
    lines.push('  processed: true');
    lines.push('}');
    lines.push('');
    
    lines.push('// Assign confidence based on goal');
    lines.push('confidence = 0.7 // Default confidence');
    if (requirements.minConfidence) {
      lines.push(`confidence = ${requirements.minConfidence}`);
    }
    lines.push('');
    
    lines.push('// Build result');
    lines.push('result = {');
    lines.push('  goal: "' + requirements.goal + '",');
    lines.push('  status: "completed",');
    lines.push('  output: processedResult,');
    lines.push('  confidence: confidence');
    lines.push('}');
    lines.push('');
    
    lines.push('// Return with confidence');
    lines.push('return result ~> confidence');
    
    return lines;
  }

}