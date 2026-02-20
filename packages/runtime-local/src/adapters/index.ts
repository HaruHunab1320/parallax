/**
 * CLI Adapters
 *
 * Re-exports adapters from coding-agent-adapters and provides the local EchoAdapter.
 */

export { EchoAdapter } from './echo-adapter';

// Re-export from coding-agent-adapters for convenience
export {
  ClaudeAdapter,
  GeminiAdapter,
  CodexAdapter,
  AiderAdapter,
  createAllAdapters,
  createAdapter,
  checkAdapters,
} from 'coding-agent-adapters';

import type { PTYManager } from 'pty-manager';
import { createAllAdapters } from 'coding-agent-adapters';
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
