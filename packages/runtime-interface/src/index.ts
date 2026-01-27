/**
 * Parallax Runtime Interface
 *
 * Shared types and interfaces for agent runtimes.
 */

// Types
export {
  AgentType,
  AgentStatus,
  MessageType,
  AgentConfig,
  AgentCredentials,
  AgentHandle,
  AgentMessage,
  RuntimeEvent,
  AgentRequirement,
  AgentMetrics,
  AgentLogEntry,
} from './types';

// Provider interface
export {
  RuntimeProvider,
  RuntimeProviderWithEvents,
  BaseRuntimeProvider,
  StopOptions,
  SendOptions,
  LogOptions,
  AgentFilter,
} from './provider';

// Adapter interface
export {
  CLIAdapter,
  ParsedOutput,
  LoginDetection,
  AdapterRegistry,
} from './adapter';
