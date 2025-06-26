import { Agent } from './types';
import { GrpcAgentProxy } from './agent-proxy';

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();

  register(agent: Agent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent with id ${agent.id} already registered`);
    }
    this.agents.set(agent.id, agent);
  }

  unregister(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  async getAvailableAgents(): Promise<Agent[]> {
    const agents = this.getAllAgents();
    const availability = await Promise.all(
      agents.map(async (agent) => ({
        agent,
        available: await agent.isAvailable(),
      }))
    );
    
    return availability
      .filter(({ available }) => available)
      .map(({ agent }) => agent);
  }

  getAgentsByCapability(capability: string): Agent[] {
    return this.getAllAgents().filter((agent) =>
      agent.capabilities.includes(capability)
    );
  }

  /**
   * Register a remote agent by creating a gRPC proxy
   */
  registerRemote(metadata: {
    id: string;
    name: string;
    endpoint: string;
  }): void {
    const proxy = GrpcAgentProxy.fromMetadata(metadata);
    this.register(proxy);
  }

  /**
   * Register multiple remote agents
   */
  registerRemoteAgents(agents: Array<{
    id: string;
    name: string;
    endpoint: string;
  }>): void {
    agents.forEach(metadata => this.registerRemote(metadata));
  }
}