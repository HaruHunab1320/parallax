/**
 * Interface for agent registry operations
 */

import { ServiceRegistration } from './types';

export interface IAgentRegistry {
  register(service: ServiceRegistration): Promise<void>;

  unregister(type: string, id: string): Promise<void>;

  get(agentId: string): Promise<ServiceRegistration | null>;

  list(): Promise<ServiceRegistration[]>;

  listServices(type?: string): Promise<ServiceRegistration[]>;

  getService(type: string, id: string): Promise<ServiceRegistration | null>;

  // Additional methods as needed
  updateLastSeen?(agentId: string): Promise<void>;
}