
/**
 * Configuration for local agents during development
 */
export interface LocalAgentConfig {
  id: string;
  name: string;
  endpoint: string;
  capabilities: string[];
}

/**
 * Helper class to manage local agent configurations for development
 */
export class LocalAgentManager {
  private agents: LocalAgentConfig[] = [];
  
  constructor(agents?: LocalAgentConfig[]) {
    if (agents) {
      this.agents = agents;
    }
  }
  
  addAgent(config: LocalAgentConfig): void {
    this.agents.push(config);
  }
  
  getAgents(): LocalAgentConfig[] {
    return this.agents;
  }
  
  createProxies(): LocalAgentConfig[] {
    // Return configs directly - proxies will be created by PatternEngine
    return this.agents;
  }
  
  getAgentsByCapabilities(requiredCapabilities: string[]): LocalAgentConfig[] {
    return this.agents.filter(agent => 
      requiredCapabilities.every(cap => agent.capabilities.includes(cap))
    );
  }
  
  /**
   * Load agents from environment variable
   * Format: PARALLAX_LOCAL_AGENTS=id1:name1:endpoint1:cap1,cap2;id2:name2:endpoint2:cap3
   */
  static fromEnv(): LocalAgentManager {
    const envAgents = process.env.PARALLAX_LOCAL_AGENTS;
    if (!envAgents) {
      return new LocalAgentManager();
    }
    
    const agents = envAgents.split(';').map(agentStr => {
      const [id, name, endpoint, ...capParts] = agentStr.split(':');
      const capabilities = capParts.join(':').split(',');
      
      return { id, name, endpoint, capabilities };
    });
    
    return new LocalAgentManager(agents);
  }
}