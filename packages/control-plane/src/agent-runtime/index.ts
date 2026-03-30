/**
 * Agent Runtime Module
 *
 * Provides integration with runtime providers for spawning and managing CLI agents.
 */

// Re-export interface types for convenience
export {
  AgentConfig,
  AgentFilter,
  AgentHandle,
  AgentMessage,
  AgentMetrics,
  AgentStatus,
  AgentType,
  SpawnThreadInput,
  ThreadEvent,
  ThreadFilter,
  ThreadHandle,
  ThreadInput,
} from '@parallaxai/runtime-interface';
export {
  AgentRuntimeService,
  AgentRuntimeServiceOptions,
  RuntimeRegistration,
} from './agent-runtime-service';
export {
  GatewayRuntimeAdapter,
  GatewayServiceAdapter,
} from './gateway-runtime-adapter';
export {
  RuntimeClient,
  RuntimeClientOptions,
  RuntimeHealthStatus,
} from './runtime-client';
