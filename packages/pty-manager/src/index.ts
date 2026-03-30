/**
 * pty-manager
 *
 * PTY session manager with lifecycle management,
 * pluggable adapters, and blocking prompt detection.
 */

export type { CLIAdapter, ShellAdapterOptions } from './adapters';
// Adapter system
export {
  AdapterRegistry,
  BaseCLIAdapter,
  createAdapter,
  ShellAdapter,
} from './adapters';
export type {
  BunPTYManagerOptions,
  WorkerSessionHandle,
} from './bun-compat';
// Bun compatibility layer
export {
  BunCompatiblePTYManager,
  createPTYManager,
  isBun,
} from './bun-compat';
// PTY preflight check
export { ensurePty } from './ensure-pty';
// Event types
export type { PTYManagerEvents } from './pty-manager';
// Core classes
export { PTYManager } from './pty-manager';
export type { PTYSessionEvents } from './pty-session';
export { PTYSession, SPECIAL_KEYS } from './pty-session';
export type {
  BuildTimelineOptions,
  TaskCompletionTimelineResult,
  TaskCompletionTimelineStep,
  TaskCompletionTraceRecord,
  TaskCompletionTurnTimeline,
} from './task-completion-trace';
export {
  buildTaskCompletionTimeline,
  extractTaskCompletionTraceRecords,
} from './task-completion-trace';
// Types
export type {
  // Factory types
  AdapterFactoryConfig,
  AuthRequiredInfo,
  AuthRequiredMethod,
  AutoResponseRule,
  BlockingPromptDetection,
  BlockingPromptInfo,
  BlockingPromptType,
  // Manager types
  Logger,
  LoginDetection,
  LogOptions,
  MessageType,
  // Adapter types
  ParsedOutput,
  PTYManagerConfig,
  SessionFilter,
  SessionHandle,
  SessionMessage,
  // Session types
  SessionStatus,
  SpawnConfig,
  // Stall detection types
  StallClassification,
  StopOptions,
  TerminalAttachment,
  // Tool running detection
  ToolRunningInfo,
} from './types';
