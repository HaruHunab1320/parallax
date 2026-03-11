/**
 * tmux-manager
 *
 * Tmux-based session manager with lifecycle management,
 * pluggable adapters, and blocking prompt detection.
 *
 * Drop-in alternative to pty-manager — no native addons required.
 */

// Tmux preflight check
export { ensureTmux, resetTmuxCheck } from './ensure-tmux.js';

// Core classes
export { TmuxManager } from './tmux-manager.js';
export { TmuxSession, SPECIAL_KEYS } from './tmux-session.js';
export { TmuxTransport, TMUX_KEY_MAP } from './tmux-transport.js';
export {
  extractTaskCompletionTraceRecords,
  buildTaskCompletionTimeline,
} from './task-completion-trace.js';

// Adapter system
export {
  AdapterRegistry,
  BaseCLIAdapter,
  createAdapter,
  ShellAdapter,
} from './adapters/index.js';

export type { CLIAdapter, ShellAdapterOptions } from './adapters/index.js';

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

  // Tool running detection
  ToolRunningInfo,

  // Manager types
  Logger,
  StopOptions,
  LogOptions,
  TerminalAttachment,
  TmuxManagerConfig,

  // Factory types
  AdapterFactoryConfig,
} from './types.js';

// Event types
export type { TmuxManagerEvents } from './tmux-manager.js';
export type { TmuxSessionEvents } from './tmux-session.js';
export type {
  TaskCompletionTraceRecord,
  TaskCompletionTimelineStep,
  TaskCompletionTurnTimeline,
  TaskCompletionTimelineResult,
  BuildTimelineOptions,
} from './task-completion-trace.js';

// Transport types
export type { TmuxSpawnOptions, TmuxCaptureOptions } from './tmux-transport.js';
