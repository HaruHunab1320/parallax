/**
 * Parallax Local Runtime
 *
 * PTY-based runtime for local CLI agent sessions.
 * Delegates to pty-manager and coding-agent-adapters for PTY/adapter management.
 */

// Re-export runtime-interface types for convenience
export {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentStatus,
  AgentType,
  RuntimeProvider,
  ThreadEvent,
  ThreadHandle,
  ThreadRuntimeProvider,
} from '@parallaxai/runtime-interface';
// Adapters (local EchoAdapter + re-exports from coding-agent-adapters)
export {
  AiderAdapter,
  ClaudeAdapter,
  CodexAdapter,
  checkAdapters,
  createAdapter,
  createAllAdapters,
  EchoAdapter,
  GeminiAdapter,
  registerAllAdapters,
} from './adapters';
// Main runtime
export { LocalRuntime, LocalRuntimeOptions } from './local-runtime';
// Server
export { RuntimeServer, RuntimeServerOptions } from './server';
