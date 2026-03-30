/**
 * tmux-manager
 *
 * Tmux-based session manager with lifecycle management,
 * pluggable adapters, and blocking prompt detection.
 *
 * Drop-in alternative to pty-manager — no native addons required.
 */

export type { CLIAdapter, ShellAdapterOptions } from './adapters/index.js';
// Adapter system
export {
  AdapterRegistry,
  BaseCLIAdapter,
  createAdapter,
  ShellAdapter,
} from './adapters/index.js';
// Tmux preflight check
export { ensureTmux, resetTmuxCheck } from './ensure-tmux.js';
export type {
  BuildTimelineOptions,
  TaskCompletionTimelineResult,
  TaskCompletionTimelineStep,
  TaskCompletionTraceRecord,
  TaskCompletionTurnTimeline,
} from './task-completion-trace.js';
export {
  buildTaskCompletionTimeline,
  extractTaskCompletionTraceRecords,
} from './task-completion-trace.js';
// Event types
export type { TmuxManagerEvents } from './tmux-manager.js';
// Core classes
export { TmuxManager } from './tmux-manager.js';
export type { TmuxSessionEvents } from './tmux-session.js';
export { SPECIAL_KEYS, TmuxSession } from './tmux-session.js';
// Transport types
export type { TmuxCaptureOptions, TmuxSpawnOptions } from './tmux-transport.js';
export { TMUX_KEY_MAP, TmuxTransport } from './tmux-transport.js';
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
  TmuxManagerConfig,
  // Tool running detection
  ToolRunningInfo,
} from './types.js';
