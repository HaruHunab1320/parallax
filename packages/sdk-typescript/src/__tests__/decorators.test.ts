import { describe, it, expect } from 'vitest';
import { ParallaxAgent } from '../agent-base';
import { withConfidence } from '../decorators';

class TestAgent extends ParallaxAgent {
  constructor() {
    super('test-agent', 'Test Agent', ['test']);
  }

  async analyze(task: string, data?: any): Promise<[any, number]> {
    return [{ result: 'base analyze' }, 0.5];
  }

  @withConfidence()
  async methodWithTuple(): Promise<[any, number]> {
    return [{ result: 'tuple method' }, 0.8];
  }

  @withConfidence({ defaultConfidence: 0.6 })
  async methodWithDefault(): Promise<any> {
    return { result: 'default confidence' };
  }

  @withConfidence({
    extractConfidence: (result) => result.score / 100
  })
  async methodWithExtractor(): Promise<any> {
    return {
      result: 'extracted confidence',
      score: 75
    };
  }

  @withConfidence()
  async methodReturningAgentResult(): Promise<any> {
    return {
      value: { result: 'already formatted' },
      confidence: 0.9,
      agent: this.id,
      timestamp: Date.now()
    };
  }
}

describe('withConfidence decorator', () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent();
  });

  it('should handle tuple return format', async () => {
    const result = await agent.methodWithTuple();
    
    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('agent');
    expect(result).toHaveProperty('timestamp');
    
    expect(result.value).toEqual({ result: 'tuple method' });
    expect(result.confidence).toBe(0.8);
    expect(result.agent).toBe('test-agent');
  });

  it('should use default confidence when not provided', async () => {
    const result = await agent.methodWithDefault();
    
    expect(result.value).toEqual({ result: 'default confidence' });
    expect(result.confidence).toBe(0.6);
  });

  it('should extract confidence using custom extractor', async () => {
    const result = await agent.methodWithExtractor();
    
    expect(result.value).toEqual({ result: 'extracted confidence', score: 75 });
    expect(result.confidence).toBe(0.75);
  });

  it('should pass through already formatted AgentResult', async () => {
    const result = await agent.methodReturningAgentResult();
    
    expect(result.value).toEqual({ result: 'already formatted' });
    expect(result.confidence).toBe(0.9);
    expect(result.agent).toBe('test-agent');
  });

  it('should preserve reasoning and uncertainties from tuple format', async () => {
    @withConfidence()
    async function methodWithMetadata(this: TestAgent): Promise<[any, number]> {
      return [{
        result: 'with metadata',
        reasoning: 'test reasoning',
        uncertainties: ['test uncertainty']
      }, 0.85];
    }

    const boundMethod = methodWithMetadata.bind(agent);
    const result = await boundMethod();
    
    expect(result.value.result).toBe('with metadata');
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning).toBe('test reasoning');
    expect(result.uncertainties).toEqual(['test uncertainty']);
  });
});