/**
 * CLI Adapters
 *
 * Re-exports adapters from coding-agent-adapters and provides the local EchoAdapter.
 */

// Re-export from coding-agent-adapters for convenience
export {
  AiderAdapter,
  ClaudeAdapter,
  CodexAdapter,
  checkAdapters,
  createAdapter,
  createAllAdapters,
  GeminiAdapter,
} from 'coding-agent-adapters';
export { EchoAdapter } from './echo-adapter';

import { createAllAdapters } from 'coding-agent-adapters';
import type { PTYManager } from 'pty-manager';
import { EchoAdapter } from './echo-adapter';

/**
 * Register all built-in adapters (coding-agent-adapters + EchoAdapter) on a PTYManager.
 */
export function registerAllAdapters(manager: PTYManager): void {
  for (const adapter of createAllAdapters()) {
    manager.registerAdapter(adapter);
  }
  manager.registerAdapter(new EchoAdapter());
}
