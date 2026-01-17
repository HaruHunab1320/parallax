/**
 * Pattern Testing Framework
 */

import * as fs from 'fs-extra';
import { Pattern } from '../types';
import { PatternValidator } from '../validator/pattern-validator';

export interface TestOptions {
  mockAgents: MockAgent[];
  input: any;
  expectedConfidence?: number;
  timeout?: number;
}

export interface MockAgent {
  id: string;
  capability?: string;
  response: any;
  confidence: number;
  delay?: number;
}

export interface TestResult {
  success: boolean;
  result: any;
  confidence: number;
  executionTime: number;
  agentCalls: AgentCall[];
  errors: string[];
}

export interface AgentCall {
  agentId: string;
  timestamp: number;
  input: any;
  output: any;
  confidence: number;
}

export class PatternTester {
  private pattern: Pattern | null = null;
  private validator: PatternValidator;
  
  constructor(private patternPath?: string) {
    this.validator = new PatternValidator();
  }
  
  /**
   * Load pattern from file
   */
  async loadPattern(path?: string): Promise<void> {
    const filePath = path || this.patternPath;
    if (!filePath) {
      throw new Error('No pattern path provided');
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    
    // Extract metadata
    const nameMatch = content.match(/@name\s+(.+)/);
    const versionMatch = content.match(/@version\s+(.+)/);
    const descriptionMatch = content.match(/@description\s+(.+)/);
    const primitivesMatch = content.match(/@primitives\s+(.+)/);
    
    this.pattern = {
      name: nameMatch ? nameMatch[1] : 'test-pattern',
      version: versionMatch ? versionMatch[1] : '1.0.0',
      description: descriptionMatch ? descriptionMatch[1] : '',
      code: content,
      metadata: {
        generated: new Date().toISOString(),
        generator: '@parallax/pattern-sdk',
        primitives: primitivesMatch ? primitivesMatch[1].split(',').map(p => p.trim()) : [],
        complexity: 0,
        estimatedAgents: 0
      },
      requirements: { goal: 'test', minConfidence: 0.7 }
    };
  }
  
  /**
   * Test pattern with mock agents
   */
  async test(options: TestOptions): Promise<TestResult> {
    if (!this.pattern) {
      await this.loadPattern();
    }
    
    const startTime = Date.now();
    const agentCalls: AgentCall[] = [];
    const errors: string[] = [];
    
    try {
      // Validate pattern first
      const validation = await this.validator.validate(this.pattern!);
      if (!validation.isValid) {
        errors.push(...validation.errors.map(e => e.message));
        return {
          success: false,
          result: null,
          confidence: 0,
          executionTime: Date.now() - startTime,
          agentCalls,
          errors
        };
      }
      
      // Simulate pattern execution
      const result = await this.simulateExecution(options, agentCalls);
      
      // Check confidence requirement
      if (options.expectedConfidence && result.confidence < options.expectedConfidence) {
        errors.push(`Confidence ${result.confidence} below expected ${options.expectedConfidence}`);
      }
      
      return {
        success: errors.length === 0,
        result: result.data,
        confidence: result.confidence,
        executionTime: Date.now() - startTime,
        agentCalls,
        errors
      };
      
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        result: null,
        confidence: 0,
        executionTime: Date.now() - startTime,
        agentCalls,
        errors
      };
    }
  }
  
  /**
   * Simulate pattern execution
   */
  private async simulateExecution(
    options: TestOptions,
    agentCalls: AgentCall[]
  ): Promise<{ data: any; confidence: number }> {
    const { mockAgents, input } = options;
    
    // Simulate different execution patterns based on primitives
    const code = this.pattern!.code;
    
    if (code.includes('parallel')) {
      // Simulate parallel execution
      const results = await Promise.all(
        mockAgents.map(async (agent) => {
          if (agent.delay) {
            await new Promise(resolve => setTimeout(resolve, agent.delay));
          }
          
          const call: AgentCall = {
            agentId: agent.id,
            timestamp: Date.now(),
            input,
            output: agent.response,
            confidence: agent.confidence
          };
          
          agentCalls.push(call);
          return { result: agent.response, confidence: agent.confidence };
        })
      );
      
      // Apply aggregation based on pattern
      if (code.includes('consensus')) {
        return this.simulateConsensus(results);
      } else if (code.includes('voting')) {
        return this.simulateVoting(results);
      } else {
        // Default: average confidence
        const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
        return { data: results.map(r => r.result), confidence: avgConfidence };
      }
      
    } else if (code.includes('sequential')) {
      // Simulate sequential execution
      let currentResult = input;
      let totalConfidence = 1;
      
      for (const agent of mockAgents) {
        if (agent.delay) {
          await new Promise(resolve => setTimeout(resolve, agent.delay));
        }
        
        const call: AgentCall = {
          agentId: agent.id,
          timestamp: Date.now(),
          input: currentResult,
          output: agent.response,
          confidence: agent.confidence
        };
        
        agentCalls.push(call);
        currentResult = agent.response;
        totalConfidence *= agent.confidence;
      }
      
      return { data: currentResult, confidence: totalConfidence };
      
    } else {
      // Default execution
      const agent = mockAgents[0];
      const call: AgentCall = {
        agentId: agent.id,
        timestamp: Date.now(),
        input,
        output: agent.response,
        confidence: agent.confidence
      };
      
      agentCalls.push(call);
      return { data: agent.response, confidence: agent.confidence };
    }
  }
  
  /**
   * Simulate consensus aggregation
   */
  private simulateConsensus(results: Array<{ result: any; confidence: number }>) {
    // Find most common result
    const resultCounts = new Map<string, number>();
    const resultConfidences = new Map<string, number[]>();
    
    results.forEach(({ result, confidence }) => {
      const key = JSON.stringify(result);
      resultCounts.set(key, (resultCounts.get(key) || 0) + 1);
      
      if (!resultConfidences.has(key)) {
        resultConfidences.set(key, []);
      }
      resultConfidences.get(key)!.push(confidence);
    });
    
    // Find result with highest count
    let consensusResult = '';
    let maxCount = 0;
    
    resultCounts.forEach((count, key) => {
      if (count > maxCount) {
        maxCount = count;
        consensusResult = key;
      }
    });
    
    // Calculate consensus confidence
    const consensusConfidences = resultConfidences.get(consensusResult) || [];
    const avgConfidence = consensusConfidences.reduce((sum, c) => sum + c, 0) / consensusConfidences.length;
    const agreementRatio = maxCount / results.length;
    
    return {
      data: JSON.parse(consensusResult),
      confidence: avgConfidence * agreementRatio
    };
  }
  
  /**
   * Simulate voting aggregation
   */
  private simulateVoting(results: Array<{ result: any; confidence: number }>) {
    // Weight votes by confidence
    const voteTallies = new Map<string, number>();
    
    results.forEach(({ result, confidence }) => {
      const key = JSON.stringify(result);
      voteTallies.set(key, (voteTallies.get(key) || 0) + confidence);
    });
    
    // Find winning vote
    let winningResult = '';
    let maxVotes = 0;
    
    voteTallies.forEach((votes, key) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        winningResult = key;
      }
    });
    
    // Calculate voting confidence
    const totalVotes = Array.from(voteTallies.values()).reduce((sum, v) => sum + v, 0);
    const voteShare = maxVotes / totalVotes;
    
    return {
      data: JSON.parse(winningResult),
      confidence: voteShare
    };
  }
  
  /**
   * Generate test report
   */
  generateReport(results: TestResult[]): string {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / totalTests;
    const avgTime = results.reduce((sum, r) => sum + r.executionTime, 0) / totalTests;
    
    let report = `Pattern Test Report
===================

Pattern: ${this.pattern?.name || 'Unknown'}
Version: ${this.pattern?.version || '1.0.0'}

Test Summary
------------
Total Tests: ${totalTests}
Passed: ${passedTests}
Failed: ${totalTests - passedTests}
Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%

Performance
-----------
Average Confidence: ${avgConfidence.toFixed(3)}
Average Execution Time: ${avgTime.toFixed(0)}ms

`;
    
    // Add individual test results
    results.forEach((result, index) => {
      report += `
Test ${index + 1}: ${result.success ? 'PASSED' : 'FAILED'}
  Confidence: ${result.confidence.toFixed(3)}
  Execution Time: ${result.executionTime}ms
  Agent Calls: ${result.agentCalls.length}
`;
      
      if (result.errors.length > 0) {
        report += `  Errors:\n`;
        result.errors.forEach(error => {
          report += `    - ${error}\n`;
        });
      }
    });
    
    return report;
  }
}