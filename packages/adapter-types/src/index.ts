/**
 * adapter-types
 *
 * Shared adapter interface, base class, registry, and types
 * for pty-manager, tmux-manager, and coding-agent-adapters.
 */

// Adapter interface and classes
export type { CLIAdapter } from './adapter-interface.js';
export { BaseCLIAdapter } from './base-adapter.js';
export { AdapterRegistry } from './adapter-registry.js';
export { createAdapter } from './adapter-factory.js';

// Types
export type {
  // Message types
  MessageType,

  // Spawn configuration
  SpawnConfig,

  // Adapter output types
  ParsedOutput,
  LoginDetection,

  // Blocking prompt types
  BlockingPromptType,
  BlockingPromptDetection,
  AutoResponseRule,

  // Tool running detection
  ToolRunningInfo,

  // Factory types
  AdapterFactoryConfig,
} from './types.js';
