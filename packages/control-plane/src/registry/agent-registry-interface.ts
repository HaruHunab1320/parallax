/**
 * Interface for agent registry operations
 */

export interface IAgentRegistry {
  register(agent: {
    id: string;
    name: string;
    address: string;
    capabilities: string[];
    metadata?: Record<string, any>;
    lastSeen: Date;
  }): Promise<void>;
  
  unregister(agentId: string): Promise<void>;
  
  get(agentId: string): Promise<any | null>;
  
  list(): Promise<any[]>;
  
  // Additional methods as needed
  updateLastSeen?(agentId: string): Promise<void>;
}