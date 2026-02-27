import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParallaxAgent } from '../agent-base';
import type { AgentResponse } from '../types/agent-response';
import * as grpc from '@grpc/grpc-js';

// Mock proto-loader (must come before grpc mock since loadProtos calls both)
vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn(() => ({}))
}));

// Mock gRPC
vi.mock('@grpc/grpc-js', () => ({
  Server: vi.fn(() => ({
    addService: vi.fn(),
    bindAsync: vi.fn((addr: string, creds: unknown, callback: (err: Error | null, port: number) => void) => {
      callback(null, 50051);
    }),
    start: vi.fn(),
    tryShutdown: vi.fn((cb: () => void) => cb())
  })),
  ServerCredentials: {
    createInsecure: vi.fn()
  },
  credentials: {
    createInsecure: vi.fn()
  },
  loadPackageDefinition: vi.fn(() => ({
    parallax: {
      confidence: {
        ConfidenceAgent: { service: {} }
      },
      registry: {
        Registry: vi.fn(() => ({
          waitForReady: vi.fn((_deadline: number, cb: (err: Error | null) => void) => cb(null)),
          register: vi.fn((_req: unknown, cb: (err: Error | null, res: unknown) => void) => cb(null, { lease_id: 'test-lease' })),
          unregister: vi.fn((_req: unknown, cb: () => void) => cb()),
          renew: vi.fn((_req: unknown, cb: (err: Error | null) => void) => cb(null))
        }))
      }
    }
  })),
  status: {
    INTERNAL: 13,
    UNAUTHENTICATED: 16
  }
}));

class TestAgent extends ParallaxAgent {
  constructor() {
    super('test-1', 'Test Agent', ['test', 'analysis']);
  }

  async analyze(task: string, data?: any): Promise<AgentResponse> {
    if (task === 'simple') {
      return { value: { result: 'success' }, confidence: 0.95 };
    }

    if (task === 'complex') {
      return {
        value: {
          result: 'analyzed',
          data: data,
        },
        confidence: 0.75,
        reasoning: 'Complex analysis performed',
        uncertainties: ['Limited data', 'Model assumptions'],
      };
    }

    return { value: { error: 'Unknown task' }, confidence: 0.1 };
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
      const response = await agent.analyze('simple');

      expect(response.value).toEqual({ result: 'success' });
      expect(response.confidence).toBe(0.95);
    });

    it('should analyze complex tasks with metadata', async () => {
      const response = await agent.analyze('complex', { input: 'test' });

      expect(response.value.result).toBe('analyzed');
      expect(response.value.data).toEqual({ input: 'test' });
      expect(response.reasoning).toBeDefined();
      expect(response.uncertainties).toHaveLength(2);
      expect(response.confidence).toBe(0.75);
    });

    it('should handle unknown tasks', async () => {
      const response = await agent.analyze('unknown');

      expect(response.value.error).toBe('Unknown task');
      expect(response.confidence).toBe(0.1);
    });
  });
  
  describe('Health Check', () => {
    it('should report healthy by default', async () => {
      const health = await agent.checkHealth();
      
      expect(health.status).toBe('healthy');
    });
    
    it('should allow custom health checks', async () => {
      class UnhealthyAgent extends ParallaxAgent {
        constructor() {
          super('unhealthy-1', 'Unhealthy Agent', []);
        }

        async analyze(): Promise<AgentResponse> {
          return { value: {}, confidence: 0 };
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
        
        async analyze(): Promise<AgentResponse> {
          return { value: {}, confidence: 0.8 };
        }
      }
      
      const metaAgent = new MetadataAgent();
      expect(metaAgent.metadata.expertise).toBe(0.9);
      expect(metaAgent.metadata.version).toBe('2.0.0');
    });
  });
});