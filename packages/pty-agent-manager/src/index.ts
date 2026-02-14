/**
 * @parallax/pty-agent-manager
 *
 * PTY-based CLI agent manager with blocking prompt detection,
 * auto-response rules, and pluggable adapters.
 */

// Core classes
export { PTYManager } from './pty-manager';
export { PTYSession } from './pty-session';

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
  BlockingPromptType,
  BlockingPromptDetection,
  AutoResponseRule,
  BlockingPromptInfo,

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
