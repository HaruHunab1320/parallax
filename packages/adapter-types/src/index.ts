/**
 * adapter-types
 *
 * Shared adapter interface, base class, registry, and types
 * for pty-manager, tmux-manager, and coding-agent-adapters.
 */

export { createAdapter } from './adapter-factory.js';
// Adapter interface and classes
export type { CLIAdapter } from './adapter-interface.js';
export { AdapterRegistry } from './adapter-registry.js';
export { BaseCLIAdapter } from './base-adapter.js';

// Output sanitization
export { sanitizeOutput } from './output-sanitizer.js';
export type { SanitizeOptions } from './output-sanitizer.js';

// Types
export type {
  // Factory types
  AdapterFactoryConfig,
  AutoResponseRule,
  BlockingPromptDetection,
  // Blocking prompt types
  BlockingPromptType,
  LoginDetection,
  // Message types
  MessageType,
  // Adapter output types
  ParsedOutput,
  // Spawn configuration
  SpawnConfig,
  // Tool running detection
  ToolRunningInfo,
} from './types.js';
