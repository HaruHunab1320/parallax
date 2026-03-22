/**
 * Agent Runtime Module
 *
 * Provides integration with runtime providers for spawning and managing CLI agents.
 */

export { RuntimeClient, RuntimeClientOptions, RuntimeHealthStatus } from './runtime-client';
export {
  AgentRuntimeService,
  AgentRuntimeServiceOptions,
  RuntimeRegistration,
} from './agent-runtime-service';
export { GatewayRuntimeAdapter, GatewayServiceAdapter } from './gateway-runtime-adapter';

// Re-export interface types for convenience
export {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentStatus,
  AgentType,
  AgentFilter,
  AgentMetrics,
  SpawnThreadInput,
  ThreadEvent,
  ThreadFilter,
  ThreadHandle,
  ThreadInput,
} from '@parallaxai/runtime-interface';
