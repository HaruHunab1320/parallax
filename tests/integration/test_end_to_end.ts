import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';
import { PatternEngine } from '@parallax/control-plane';
import { RuntimeManager } from '@parallax/control-plane';
import { EtcdRegistry } from '@parallax/control-plane';
import { AgentRegistry, GrpcAgentProxy } from '@parallax/runtime';
import pino from 'pino';
import path from 'path';

/**
 * End-to-end integration tests
 * These test the full flow from agents to patterns
 */

// Test agents
class AnalysisAgent extends ParallaxAgent {
  constructor(id: string) {
    super(id, `Analysis Agent ${id}`, ['analysis', 'test']);
  }
  
  async analyze(task: string, data?: any): Promise<[any, number]> {
    if (task.includes('analyze')) {
      return [
        { 
          analysis: `Analyzed by ${this.id}`,
          input: data,
          timestamp: new Date().toISOString()
        },
        0.85 + Math.random() * 0.1 // 0.85-0.95 confidence
      ];
    }
    return [{ error: 'Unknown task' }, 0.3];
  }
}

describe('End-to-End Integration Tests', () => {
  let agents: ParallaxAgent[] = [];
  let agentPorts: number[] = [];
  let patternEngine: PatternEngine;
  let agentRegistry: AgentRegistry;
  const logger = pino({ level: 'silent' });
  
  beforeAll(async () => {
    // Start multiple test agents
    for (let i = 1; i <= 3; i++) {
      const agent = new AnalysisAgent(`analysis-${i}`);
      const port = await agent.serve(0); // Auto-assign port
      agents.push(agent);
      agentPorts.push(port);
    }
    
    // Create runtime components
    const runtimeManager = new RuntimeManager(logger);
    await runtimeManager.initialize();
    
    // Create mock etcd registry
    const etcdRegistry = {
      listServices: async () => [],
      registerService: async () => {},
      unregisterService: async () => {},
    } as any;
    
    // Create pattern engine
    const patternsDir = path.join(__dirname, '../../patterns');
    patternEngine = new PatternEngine(
      runtimeManager,
      etcdRegistry,
      patternsDir,
      logger
    );
    
    // Create local agent registry and register proxies
    agentRegistry = new AgentRegistry();
    agents.forEach((agent, i) => {
      const proxy = new GrpcAgentProxy(
        agent.id,
        agent.name,
        `localhost:${agentPorts[i]}`
      );
      agentRegistry.register(proxy);
    });
    
    // Override pattern engine to use our local agents
    (patternEngine as any).selectAgents = async () => {
      return agentRegistry.getAllAgents();
    };
    
    await patternEngine.initialize();
  }, 30000); // 30 second timeout for setup
  
  afterAll(async () => {
    // Shutdown all agents
    await Promise.all(agents.map(agent => agent.shutdown()));
  });
  
  describe('Pattern Execution with Real Agents', () => {
    it('should execute consensus-builder pattern with real agents', async () => {
      const result = await patternEngine.executePattern('consensus-builder', {
        task: 'analyze this data',
        data: { test: true, value: 42 }
      });
      
      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();
      expect(result.result.confidence).toBeGreaterThan(0.8);
      expect(result.result.results).toHaveLength(3);
      
      // Check that all agents participated
      const agentIds = result.result.results.map((r: any) => r.agent);
      expect(agentIds).toContain('analysis-1');
      expect(agentIds).toContain('analysis-2');
      expect(agentIds).toContain('analysis-3');
    });
    
    it('should execute confidence-cascade pattern', async () => {
      const result = await patternEngine.executePattern('confidence-cascade', {
        task: 'analyze with cascade',
        data: { cascade: true },
        targetConfidence: 0.9
      });
      
      expect(result.status).toBe('completed');
      expect(result.result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.result.agentResults.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should handle pattern errors gracefully', async () => {
      // Execute with task that agents don't understand
      const result = await patternEngine.executePattern('consensus-builder', {
        task: 'unknown task type',
        data: {}
      });
      
      expect(result.status).toBe('completed');
      expect(result.result.confidence).toBeLessThan(0.5);
    });
  });
  
  describe('Agent Communication', () => {
    it('should handle concurrent requests to agents', async () => {
      const promises = [];
      
      // Send 10 concurrent requests
      for (let i = 0; i < 10; i++) {
        promises.push(
          patternEngine.executePattern('consensus-builder', {
            task: `analyze request ${i}`,
            data: { requestId: i }
          })
        );
      }
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      results.forEach(result => {
        expect(result.status).toBe('completed');
        expect(result.result).toBeDefined();
      });
    });
    
    it('should handle agent unavailability', async () => {
      // Shutdown one agent
      await agents[0].shutdown();
      
      // Pattern should still work with remaining agents
      const result = await patternEngine.executePattern('consensus-builder', {
        task: 'analyze with fewer agents',
        data: {}
      });
      
      expect(result.status).toBe('completed');
      expect(result.result.results.length).toBeLessThan(3);
      
      // Restart the agent
      agents[0] = new AnalysisAgent('analysis-1');
      agentPorts[0] = await agents[0].serve(0);
    });
  });
  
  describe('Confidence Propagation', () => {
    it('should propagate confidence through pattern execution', async () => {
      const result = await patternEngine.executePattern('robust-analysis', {
        task: 'analyze with confidence tracking',
        data: { important: true }
      });
      
      expect(result.status).toBe('completed');
      expect(result.result.confidence).toBeDefined();
      expect(result.result.confidence).toBeGreaterThan(0);
      expect(result.result.confidence).toBeLessThanOrEqual(1);
      
      // Check metadata
      expect(result.result.robustness).toBeDefined();
      expect(result.result.robustness.patternsUsed).toBeInstanceOf(Array);
    });
  });
});