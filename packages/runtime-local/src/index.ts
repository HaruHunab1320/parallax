/**
 * Parallax Local Runtime
 *
 * PTY-based runtime for local CLI agent sessions.
 * Delegates to pty-manager and coding-agent-adapters for PTY/adapter management.
 */

// Main runtime
export { LocalRuntime, LocalRuntimeOptions } from './local-runtime';

// Server
export { RuntimeServer, RuntimeServerOptions } from './server';

// Adapters (local EchoAdapter + re-exports from coding-agent-adapters)
export {
  EchoAdapter,
  ClaudeAdapter,
  GeminiAdapter,
  CodexAdapter,
  AiderAdapter,
  registerAllAdapters,
  createAllAdapters,
  createAdapter,
  checkAdapters,
} from './adapters';

// Re-export runtime-interface types for convenience
export {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentStatus,
  AgentType,
  RuntimeProvider,
} from '@parallax/runtime-interface';
