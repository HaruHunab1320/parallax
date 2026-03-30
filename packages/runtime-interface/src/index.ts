/**
 * Parallax Runtime Interface
 *
 * Shared types and interfaces for agent runtimes.
 */

// Adapter interface
export {
  AdapterRegistry,
  AutoResponseRule,
  BlockingPromptDetection,
  BlockingPromptType,
  CLIAdapter,
  LoginDetection,
  ParsedOutput,
} from './adapter';

// Provider interface
export {
  AgentFilter,
  BaseRuntimeProvider,
  LogOptions,
  RuntimeProvider,
  RuntimeProviderWithEvents,
  SendOptions,
  StopOptions,
  ThreadRuntimeProvider,
} from './provider';
// Types
export {
  AgentConfig,
  AgentCredentials,
  AgentHandle,
  AgentLogEntry,
  AgentMessage,
  AgentMetrics,
  AgentRequirement,
  AgentStatus,
  AgentType,
  BlockingPromptInfo,
  MessageType,
  RuntimeEvent,
  SpawnThreadInput,
  ThreadApprovalPreset,
  ThreadCompletion,
  ThreadContextFile,
  ThreadEvent,
  ThreadEventType,
  ThreadFilter,
  ThreadHandle,
  ThreadInput,
  ThreadPolicy,
  ThreadPreparationSpec,
  ThreadStatus,
  ThreadWorkspaceRef,
} from './types';
