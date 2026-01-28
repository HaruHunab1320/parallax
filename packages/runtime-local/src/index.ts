/**
 * Parallax Local Runtime
 *
 * PTY-based runtime for local CLI agent sessions.
 */

// Main runtime
export { LocalRuntime, LocalRuntimeOptions } from './local-runtime';

// Server
export { RuntimeServer, RuntimeServerOptions } from './server';

// PTY management
export { PTYSession } from './pty/pty-session';
export { PTYManager } from './pty/pty-manager';

// Adapters
export {
  BaseCLIAdapter,
  ClaudeAdapter,
  CodexAdapter,
  GeminiAdapter,
  createDefaultRegistry,
  defaultRegistry,
} from './adapters';

// Re-export interface types for convenience
export {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentStatus,
  AgentType,
  RuntimeProvider,
  CLIAdapter,
} from '@parallax/runtime-interface';
