import { AgentConnection } from './types';

export enum LoadBalancingStrategy {
  ROUND_ROBIN = 'ROUND_ROBIN',
  LEAST_CONNECTIONS = 'LEAST_CONNECTIONS',
  WEIGHTED_RESPONSE_TIME = 'WEIGHTED_RESPONSE_TIME',
  CONFIDENCE_BASED = 'CONFIDENCE_BASED',
}

export class LoadBalancer {
  private currentIndex: number = 0;
  private connectionCounts: Map<string, number> = new Map();

  constructor(private strategy: LoadBalancingStrategy = LoadBalancingStrategy.ROUND_ROBIN) {}

  selectAgent(agents: AgentConnection[]): AgentConnection | null {
    const availableAgents = agents.filter(a => a.status === 'connected');
    
    if (availableAgents.length === 0) {
      return null;
    }

    switch (this.strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        return this.roundRobin(availableAgents);
      
      case LoadBalancingStrategy.LEAST_CONNECTIONS:
        return this.leastConnections(availableAgents);
      
      case LoadBalancingStrategy.WEIGHTED_RESPONSE_TIME:
        return this.weightedResponseTime(availableAgents);
      
      case LoadBalancingStrategy.CONFIDENCE_BASED:
        return this.confidenceBased(availableAgents);
      
      default:
        return availableAgents[0];
    }
  }

  private roundRobin(agents: AgentConnection[]): AgentConnection {
    const agent = agents[this.currentIndex % agents.length];
    this.currentIndex++;
    return agent;
  }

  private leastConnections(agents: AgentConnection[]): AgentConnection {
    let minConnections = Infinity;
    let selectedAgent = agents[0];

    for (const agent of agents) {
      const connections = this.connectionCounts.get(agent.id) || 0;
      if (connections < minConnections) {
        minConnections = connections;
        selectedAgent = agent;
      }
    }

    return selectedAgent;
  }

  private weightedResponseTime(agents: AgentConnection[]): AgentConnection {
    // Select agent with best response time weighted by success rate
    let bestScore = -Infinity;
    let selectedAgent = agents[0];

    for (const agent of agents) {
      const score = agent.metrics.successRate / (agent.metrics.averageLatency + 1);
      if (score > bestScore) {
        bestScore = score;
        selectedAgent = agent;
      }
    }

    return selectedAgent;
  }

  private confidenceBased(agents: AgentConnection[]): AgentConnection {
    // Select agent with highest success rate
    let highestSuccessRate = -1;
    let selectedAgent = agents[0];

    for (const agent of agents) {
      if (agent.metrics.successRate > highestSuccessRate) {
        highestSuccessRate = agent.metrics.successRate;
        selectedAgent = agent;
      }
    }

    return selectedAgent;
  }

  incrementConnection(agentId: string): void {
    const current = this.connectionCounts.get(agentId) || 0;
    this.connectionCounts.set(agentId, current + 1);
  }

  decrementConnection(agentId: string): void {
    const current = this.connectionCounts.get(agentId) || 0;
    this.connectionCounts.set(agentId, Math.max(0, current - 1));
  }

  reset(): void {
    this.currentIndex = 0;
    this.connectionCounts.clear();
  }
}