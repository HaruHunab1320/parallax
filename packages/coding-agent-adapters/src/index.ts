/**
 * coding-agent-adapters
 *
 * CLI adapters for AI coding agents.
 * Works with pty-manager to spawn and manage coding agents.
 *
 * @example
 * ```typescript
 * import { PTYManager, AdapterRegistry } from 'pty-manager';
 * import { ClaudeAdapter, GeminiAdapter } from 'coding-agent-adapters';
 *
 * const registry = new AdapterRegistry();
 * registry.register(new ClaudeAdapter());
 * registry.register(new GeminiAdapter());
 *
 * const manager = new PTYManager({ adapters: registry });
 *
 * const session = await manager.spawn({
 *   name: 'my-agent',
 *   type: 'claude',
 *   workdir: '/path/to/project',
 *   adapterConfig: {
 *     anthropicKey: process.env.ANTHROPIC_API_KEY,
 *   },
 * });
 * ```
 */

// Base class for extending
export { BaseCodingAdapter } from './base-coding-adapter';
export type { AgentCredentials, CodingAgentConfig, InstallationInfo } from './base-coding-adapter';

// Adapters
export { ClaudeAdapter } from './claude-adapter';
export { GeminiAdapter } from './gemini-adapter';
export { CodexAdapter } from './codex-adapter';
export { AiderAdapter } from './aider-adapter';

// Convenience function to register all adapters
import { ClaudeAdapter } from './claude-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { CodexAdapter } from './codex-adapter';
import { AiderAdapter } from './aider-adapter';

/**
 * Create instances of all available adapters
 */
export function createAllAdapters() {
  return [
    new ClaudeAdapter(),
    new GeminiAdapter(),
    new CodexAdapter(),
    new AiderAdapter(),
  ];
}

/**
 * Adapter type to class mapping
 */
export const ADAPTER_TYPES = {
  claude: ClaudeAdapter,
  gemini: GeminiAdapter,
  codex: CodexAdapter,
  aider: AiderAdapter,
} as const;

export type AdapterType = keyof typeof ADAPTER_TYPES;

/**
 * Create a specific adapter by type
 */
export function createAdapter(type: AdapterType) {
  const AdapterClass = ADAPTER_TYPES[type];
  if (!AdapterClass) {
    throw new Error(`Unknown adapter type: ${type}`);
  }
  return new AdapterClass();
}

/**
 * Result of checking if a CLI is installed
 */
export interface PreflightResult {
  adapter: string;
  installed: boolean;
  version?: string;
  error?: string;
  installCommand: string;
  docsUrl: string;
}

/**
 * Check if specific adapters are installed
 *
 * @example
 * ```typescript
 * const results = await checkAdapters(['claude', 'aider']);
 * for (const result of results) {
 *   if (!result.installed) {
 *     console.log(`${result.adapter} not found. Install: ${result.installCommand}`);
 *   }
 * }
 * ```
 */
export async function checkAdapters(types: AdapterType[]): Promise<PreflightResult[]> {
  const results: PreflightResult[] = [];

  for (const type of types) {
    const adapter = createAdapter(type);
    const validation = await adapter.validateInstallation();

    results.push({
      adapter: adapter.displayName,
      installed: validation.installed,
      version: validation.version,
      error: validation.error,
      installCommand: adapter.installation.command,
      docsUrl: adapter.installation.docsUrl,
    });
  }

  return results;
}

/**
 * Check all available adapters
 *
 * @example
 * ```typescript
 * const results = await checkAllAdapters();
 * const missing = results.filter(r => !r.installed);
 *
 * if (missing.length > 0) {
 *   console.log('Missing CLI tools:');
 *   for (const m of missing) {
 *     console.log(`  ${m.adapter}: ${m.installCommand}`);
 *   }
 * }
 * ```
 */
export async function checkAllAdapters(): Promise<PreflightResult[]> {
  return checkAdapters(Object.keys(ADAPTER_TYPES) as AdapterType[]);
}

/**
 * Print installation instructions for missing adapters
 */
export async function printMissingAdapters(types?: AdapterType[]): Promise<void> {
  const results = types ? await checkAdapters(types) : await checkAllAdapters();
  const missing = results.filter(r => !r.installed);

  if (missing.length === 0) {
    console.log('All CLI tools are installed!');
    return;
  }

  console.log('\nMissing CLI tools:\n');
  for (const m of missing) {
    console.log(`${m.adapter}`);
    console.log(`  Install: ${m.installCommand}`);
    console.log(`  Docs: ${m.docsUrl}`);
    if (m.error) {
      console.log(`  Error: ${m.error}`);
    }
    console.log();
  }
}
