/**
 * pty-manager
 *
 * PTY session manager with lifecycle management,
 * pluggable adapters, and blocking prompt detection.
 */

// Core classes
export { PTYManager } from './pty-manager';
export { PTYSession, SPECIAL_KEYS } from './pty-session';
export {
  extractTaskCompletionTraceRecords,
  buildTaskCompletionTimeline,
} from './task-completion-trace';

// Adapter system
export {
  AdapterRegistry,
  BaseCLIAdapter,
  createAdapter,
  ShellAdapter,
} from './adapters';

export type { CLIAdapter, ShellAdapterOptions } from './adapters';

// Types
export type {
  // Session types
  SessionStatus,
  MessageType,
  SpawnConfig,
  SessionHandle,
  SessionMessage,
  SessionFilter,

  // Adapter types
  ParsedOutput,
  LoginDetection,
  AuthRequiredMethod,
  AuthRequiredInfo,
  BlockingPromptType,
  BlockingPromptDetection,
  AutoResponseRule,
  BlockingPromptInfo,

  // Stall detection types
  StallClassification,

  // Manager types
  Logger,
  StopOptions,
  LogOptions,
  TerminalAttachment,
  PTYManagerConfig,

  // Factory types
  AdapterFactoryConfig,
} from './types';

// Event types
export type { PTYManagerEvents } from './pty-manager';
export type { PTYSessionEvents } from './pty-session';
export type {
  TaskCompletionTraceRecord,
  TaskCompletionTimelineStep,
  TaskCompletionTurnTimeline,
  TaskCompletionTimelineResult,
  BuildTimelineOptions,
} from './task-completion-trace';

// Bun compatibility layer
export {
  BunCompatiblePTYManager,
  createPTYManager,
  isBun,
} from './bun-compat';

export type {
  WorkerSessionHandle,
  BunPTYManagerOptions,
} from './bun-compat';
