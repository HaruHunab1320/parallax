import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParallaxAgent } from '../agent-base';
import * as grpc from '@grpc/grpc-js';

// Mock gRPC
vi.mock('@grpc/grpc-js', () => ({
  Server: vi.fn(() => ({
    addService: vi.fn(),
    bindAsync: vi.fn((addr, creds, callback) => {
      callback(null, 50051);
    }),
    start: vi.fn()
  })),
  ServerCredentials: {
    createInsecure: vi.fn()
  },
  status: {
    INTERNAL: 13
  }
}));

class TestAgent extends ParallaxAgent {
  constructor() {
    super('test-1', 'Test Agent', ['test', 'analysis']);
  }
  
  async analyze(task: string, data?: any): Promise<[any, number]> {
    if (task === 'simple') {
      return [{ result: 'success' }, 0.95];
    }
    
    if (task === 'complex') {
      return [
        {
          result: 'analyzed',
          data: data,
          reasoning: 'Complex analysis performed',
          uncertainties: ['Limited data', 'Model assumptions']
        },
        0.75
      ];
    }
    
    return [{ error: 'Unknown task' }, 0.1];
  }
}

describe('ParallaxAgent', () => {
  let agent: TestAgent;
  
  beforeEach(() => {
    agent = new TestAgent();
  });
  
  describe('Construction', () => {
    it('should create agent with correct properties', () => {
      expect(agent.id).toBe('test-1');
      expect(agent.name).toBe('Test Agent');
      expect(agent.capabilities).toEqual(['test', 'analysis']);
    });
  });
  
  describe('Analysis', () => {
    it('should analyze simple tasks', async () => {
      const [result, confidence] = await agent.analyze('simple');
      
      expect(result).toEqual({ result: 'success' });
      expect(confidence).toBe(0.95);
    });
    
    it('should analyze complex tasks with metadata', async () => {
      const [result, confidence] = await agent.analyze('complex', { input: 'test' });
      
      expect(result.result).toBe('analyzed');
      expect(result.data).toEqual({ input: 'test' });
      expect(result.reasoning).toBeDefined();
      expect(result.uncertainties).toHaveLength(2);
      expect(confidence).toBe(0.75);
    });
    
    it('should handle unknown tasks', async () => {
      const [result, confidence] = await agent.analyze('unknown');
      
      expect(result.error).toBe('Unknown task');
      expect(confidence).toBe(0.1);
    });
  });
  
  describe('Health Check', () => {
    it('should report healthy by default', async () => {
      const health = await agent.checkHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.message).toBeDefined();
    });
    
    it('should allow custom health checks', async () => {
      class UnhealthyAgent extends ParallaxAgent {
        constructor() {
          super('unhealthy-1', 'Unhealthy Agent', []);
        }
        
        async analyze(): Promise<[any, number]> {
          return [{}, 0];
        }
        
        async checkHealth() {
          return {
            status: 'degraded' as const,
            message: 'Low memory'
          };
        }
      }
      
      const unhealthyAgent = new UnhealthyAgent();
      const health = await unhealthyAgent.checkHealth();
      
      expect(health.status).toBe('degraded');
      expect(health.message).toBe('Low memory');
    });
  });
  
  describe('gRPC Server', () => {
    it('should start server on specified port', async () => {
      const port = await agent.serve(50051);
      
      expect(port).toBe(50051);
      expect(grpc.Server).toHaveBeenCalled();
    });
    
    it('should auto-assign port when 0 is specified', async () => {
      const port = await agent.serve(0);
      
      expect(port).toBe(50051); // Mocked to return this
    });
  });
  
  describe('Metadata', () => {
    it('should support custom metadata', () => {
      class MetadataAgent extends ParallaxAgent {
        constructor() {
          super('meta-1', 'Metadata Agent', ['analysis'], {
            expertise: 0.9,
            capabilityScores: {
              analysis: 0.95,
              synthesis: 0.85
            },
            version: '2.0.0'
          });
        }
        
        async analyze(): Promise<[any, number]> {
          return [{}, 0.8];
        }
      }
      
      const metaAgent = new MetadataAgent();
      expect(metaAgent.metadata.expertise).toBe(0.9);
      expect(metaAgent.metadata.version).toBe('2.0.0');
    });
  });
});