/**
 * Test utilities for pattern testing
 */

import { Agent, AgentResult } from '@parallax/runtime';

/**
 * Mock agent for testing patterns
 */
export class MockAgent implements Agent {
  private responses: Map<string, { result: any; confidence: number }> = new Map();
  
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly capabilities: string[] = ['analysis'],
    public readonly endpoint?: string
  ) {}
  
  /**
   * Configure a response for a specific task
   */
  setResponse(task: string, result: any, confidence: number): void {
    this.responses.set(task, { result, confidence });
  }
  
  /**
   * Configure a default response for any task
   */
  setDefaultResponse(result: any, confidence: number): void {
    this.responses.set('*', { result, confidence });
  }
  
  async isAvailable(): Promise<boolean> {
    return true;
  }
  
  async analyze<T>(task: string, data?: any): Promise<AgentResult<T>> {
    const response = this.responses.get(task) || this.responses.get('*') || {
      result: { mock: true, task, data },
      confidence: 0.8
    };
    
    return {
      value: response.result as T,
      confidence: response.confidence,
      agent: this.name,
      timestamp: Date.now()
    };
  }
}

/**
 * Create a set of mock agents for testing
 */
export function createMockAgents(count: number, prefix = 'mock-agent'): MockAgent[] {
  return Array.from({ length: count }, (_, i) => 
    new MockAgent(
      `${prefix}-${i + 1}`,
      `Mock Agent ${i + 1}`,
      ['analysis', 'test']
    )
  );
}

/**
 * Mock pattern execution context
 */
export function createMockContext(agents: Agent[], input: any = {}) {
  return {
    input,
    agents,
    parallax: {
      agents
    },
    executePattern: async (name: string, input: any) => {
      // Mock pattern execution
      return {
        value: { pattern: name, input },
        confidence: 0.85
      };
    }
  };
}

/**
 * Assert confidence is within expected range
 */
export function assertConfidence(
  actual: number,
  expected: number,
  tolerance = 0.01
): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `Confidence ${actual} not within tolerance ${tolerance} of expected ${expected}`
    );
  }
}