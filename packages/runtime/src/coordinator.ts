import { Agent, AgentResult, CoordinationPattern } from './types';
import { AgentRegistry } from './agent-registry';
import { ConfidenceProtocol } from './confidence-protocol';

export class ParallaxCoordinator {
  private registry: AgentRegistry;
  private protocol: ConfidenceProtocol;
  private patterns: Map<string, CoordinationPattern> = new Map();

  constructor() {
    this.registry = new AgentRegistry();
    this.protocol = new ConfidenceProtocol();
  }

  registerAgent(agent: Agent): void {
    this.registry.register(agent);
  }

  registerPattern(pattern: CoordinationPattern): void {
    this.patterns.set(pattern.name, pattern);
  }

  async coordinate<T>(
    patternName: string,
    task: string,
    data?: any
  ): Promise<T> {
    const pattern = this.patterns.get(patternName);
    if (!pattern) {
      throw new Error(`Pattern ${patternName} not found`);
    }

    const agents = await this.registry.getAvailableAgents();
    if (agents.length === 0) {
      throw new Error('No available agents');
    }

    return pattern.execute<T>(agents, task, data);
  }

  async analyzeWithAllAgents<T>(
    task: string,
    data?: any
  ): Promise<AgentResult<T>[]> {
    const agents = await this.registry.getAvailableAgents();
    
    const results = await Promise.all(
      agents.map((agent) => agent.analyze<T>(task, data))
    );

    return results;
  }

  async getConsensus<T>(results: AgentResult<T>[]) {
    return this.protocol.calculateWeightedConsensus(results);
  }

  shouldExploreParallel(results: AgentResult[]): boolean {
    return this.protocol.shouldExploreParallel(results);
  }

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  getProtocol(): ConfidenceProtocol {
    return this.protocol;
  }
}