/**
 * CLI Adapters
 *
 * Export all CLI adapters and provide a pre-configured registry.
 */

export { BaseCLIAdapter } from './base-adapter';
export { ClaudeAdapter } from './claude-adapter';
export { CodexAdapter } from './codex-adapter';
export { GeminiAdapter } from './gemini-adapter';
export { EchoAdapter } from './echo-adapter';

import { AdapterRegistry } from '@parallax/runtime-interface';
import { ClaudeAdapter } from './claude-adapter';
import { CodexAdapter } from './codex-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { EchoAdapter } from './echo-adapter';

/**
 * Create a registry with all built-in adapters
 */
export function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();

  registry.register(new ClaudeAdapter());
  registry.register(new CodexAdapter());
  registry.register(new GeminiAdapter());
  registry.register(new EchoAdapter());

  return registry;
}

/**
 * Default adapter registry instance
 */
export const defaultRegistry = createDefaultRegistry();
