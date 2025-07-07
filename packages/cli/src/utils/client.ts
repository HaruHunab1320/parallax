/**
 * Client utilities for connecting to Parallax services
 */

import { AgentRegistry, GrpcAgentProxy } from '@parallax/runtime';

export interface ParallaxConfig {
  controlPlaneEndpoint?: string;
  registryEndpoint?: string;
  localAgents?: string;
}

export class ParallaxClient {
  private config: ParallaxConfig;
  private agentRegistry: AgentRegistry;
  
  constructor(config: ParallaxConfig = {}) {
    this.config = {
      controlPlaneEndpoint: config.controlPlaneEndpoint || process.env.PARALLAX_CONTROL_PLANE || 'localhost:50050',
      registryEndpoint: config.registryEndpoint || process.env.PARALLAX_REGISTRY || 'localhost:50051',
      localAgents: config.localAgents || process.env.PARALLAX_LOCAL_AGENTS
    };
    
    this.agentRegistry = new AgentRegistry();
    this.initializeLocalAgents();
  }
  
  private initializeLocalAgents() {
    if (!this.config.localAgents) return;
    
    // Parse local agents from environment
    // Format: id:name:endpoint:cap1,cap2;id2:name2:endpoint2:cap3
    const agents = this.config.localAgents.split(';').map(agentStr => {
      const [id, name, endpoint, ...capParts] = agentStr.split(':');
      const capabilities = capParts.join(':').split(',');
      return { id, name, endpoint, capabilities };
    });
    
    // Register each agent
    agents.forEach(agent => {
      const proxy = new GrpcAgentProxy(agent.id, agent.name, agent.endpoint);
      // Set capabilities
      (proxy as any)._capabilities = agent.capabilities;
      this.agentRegistry.register(proxy);
    });
  }
  
  async listAgents() {
    const agents = await this.agentRegistry.getAvailableAgents();
    return agents.map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      capabilities: agent.capabilities,
      endpoint: agent.endpoint,
      available: true
    }));
  }
  
  async getAgent(agentId: string) {
    return this.agentRegistry.getAgent(agentId);
  }
  
  async testAgent(agentId: string, task: string, data?: any) {
    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    const result = await agent.analyze(task, data);
    return result;
  }
  
  async getAgentHealth(agentId: string) {
    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    const available = await agent.isAvailable();
    return {
      id: agentId,
      available,
      status: available ? 'healthy' : 'unhealthy'
    };
  }
  
  // Pattern-related methods would connect to control plane
  async listPatterns(): Promise<string[]> {
    // TODO: Connect to control plane
    return [
      'consensus-builder',
      'epistemic-orchestrator', 
      'uncertainty-router',
      'confidence-cascade',
      'load-balancer',
      'cascading-refinement',
      'parallel-exploration',
      'multi-validator',
      'uncertainty-mapreduce',
      'robust-analysis'
    ];
  }
  
  async executePattern(patternName: string, input: any) {
    // TODO: Connect to control plane via gRPC
    console.log(`Would execute pattern ${patternName} with input:`, input);
    
    // Mock result
    return {
      pattern: patternName,
      status: 'completed',
      result: {
        value: 'Mock result',
        confidence: 0.85,
        agents: [
          { id: 'agent-1', name: 'Mock Agent 1', confidence: 0.9 },
          { id: 'agent-2', name: 'Mock Agent 2', confidence: 0.8 }
        ]
      },
      executionTime: 1234
    };
  }
}