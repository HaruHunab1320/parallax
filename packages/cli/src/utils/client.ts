/**
 * Client utilities for connecting to Parallax services
 */

import { AgentRegistry, GrpcAgentProxy } from '@parallax/runtime';
import { ParallaxHttpClient } from './http-client';

export interface ParallaxConfig {
  controlPlaneEndpoint?: string;
  registryEndpoint?: string;
  localAgents?: string;
}

export class ParallaxClient {
  private config: ParallaxConfig;
  private agentRegistry: AgentRegistry;
  private httpClient: ParallaxHttpClient;
  
  constructor(config: ParallaxConfig = {}) {
    this.config = {
      controlPlaneEndpoint: config.controlPlaneEndpoint || process.env.PARALLAX_API_URL || process.env.PARALLAX_CONTROL_PLANE || 'http://localhost:3000',
      registryEndpoint: config.registryEndpoint || process.env.PARALLAX_REGISTRY || 'localhost:50051',
      localAgents: config.localAgents || process.env.PARALLAX_LOCAL_AGENTS
    };
    
    this.agentRegistry = new AgentRegistry();
    this.httpClient = new ParallaxHttpClient({
      baseURL: this.resolveControlPlaneUrl(this.config.controlPlaneEndpoint)
    });
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
    const patterns = await this.httpClient.listPatterns();
    return patterns.map(pattern => pattern.name);
  }
  
  async executePattern(patternName: string, input: any, options?: { timeout?: number }) {
    return this.httpClient.executePattern(patternName, input, options);
  }

  private resolveControlPlaneUrl(endpoint?: string): string {
    if (!endpoint) return 'http://localhost:3000';
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    return `http://${endpoint}`;
  }
}
