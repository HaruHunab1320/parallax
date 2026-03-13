/**
 * Parallax Runtime Interface
 *
 * Shared types and interfaces for agent runtimes.
 */

// Types
export {
  AgentType,
  AgentStatus,
  ThreadStatus,
  MessageType,
  AgentConfig,
  AgentCredentials,
  AgentHandle,
  ThreadWorkspaceRef,
  ThreadCompletion,
  ThreadPolicy,
  ThreadApprovalPreset,
  ThreadContextFile,
  ThreadPreparationSpec,
  ThreadHandle,
  AgentMessage,
  RuntimeEvent,
  BlockingPromptInfo,
  ThreadEventType,
  ThreadEvent,
  AgentRequirement,
  AgentMetrics,
  AgentLogEntry,
  SpawnThreadInput,
  ThreadInput,
  ThreadFilter,
} from './types';

// Provider interface
export {
  RuntimeProvider,
  ThreadRuntimeProvider,
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
  BlockingPromptType,
  BlockingPromptDetection,
  AutoResponseRule,
  AdapterRegistry,
} from './adapter';
