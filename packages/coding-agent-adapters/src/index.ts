/**
 * coding-agent-adapters
 *
 * CLI adapters for AI coding agents.
 * Works with pty-manager to spawn and manage coding agents.
 *
 * @example
 * ```typescript
 * import { PTYManager } from 'pty-manager';
 * import { ClaudeAdapter, GeminiAdapter } from 'coding-agent-adapters';
 *
 * const manager = new PTYManager();
 * manager.registerAdapter(new ClaudeAdapter());
 * manager.registerAdapter(new GeminiAdapter());
 *
 * // Non-interactive mode (default) - for automation
 * const session = await manager.spawn({
 *   name: 'my-agent',
 *   type: 'claude',
 *   workdir: '/path/to/project',
 *   adapterConfig: {
 *     anthropicKey: process.env.ANTHROPIC_API_KEY,
 *   },
 * });
 *
 * // Interactive mode - full CLI experience
 * const interactiveSession = await manager.spawn({
 *   name: 'my-interactive-agent',
 *   type: 'claude',
 *   workdir: '/path/to/project',
 *   adapterConfig: {
 *     anthropicKey: process.env.ANTHROPIC_API_KEY,
 *     interactive: true, // Skip --print/--quiet/--non-interactive flags
 *   },
 * });
 * ```
 */

import pino from 'pino';

const logger = pino({ name: 'coding-agent-adapters' });

export { AiderAdapter } from './aider-adapter';
export type {
  ApprovalConfig,
  ApprovalPreset,
  PresetDefinition,
  RiskLevel,
  ToolCategory,
  ToolCategoryInfo,
} from './approval-presets';
// Approval presets
export {
  AIDER_COMMAND_CATEGORIES,
  CLAUDE_TOOL_CATEGORIES,
  CODEX_TOOL_CATEGORIES,
  GEMINI_TOOL_CATEGORIES,
  generateAiderApprovalConfig,
  generateApprovalConfig,
  generateClaudeApprovalConfig,
  generateCodexApprovalConfig,
  generateGeminiApprovalConfig,
  generateHermesApprovalConfig,
  getPresetDefinition,
  listPresets,
  PRESET_DEFINITIONS,
  TOOL_CATEGORIES,
} from './approval-presets';
// Types
export type {
  AdapterType,
  AgentCredentials,
  AgentFileDescriptor,
  AuthStatus,
  CodingAgentConfig,
  InstallationInfo,
  ModelRecommendations,
  WriteMemoryOptions,
} from './base-coding-adapter';
// Base class for extending
export { BaseCodingAdapter } from './base-coding-adapter';
// Adapters
export { ClaudeAdapter } from './claude-adapter';
export { CodexAdapter } from './codex-adapter';
export { GeminiAdapter } from './gemini-adapter';
export { HermesAdapter } from './hermes-adapter';
export type { AdapterPatterns } from './pattern-loader';
// Pattern loading (dynamic patterns from adapter-monitor, with baseline fallback)
export {
  clearPatternCache,
  getBaselinePatterns,
  hasDynamicPatterns,
  loadPatterns,
  loadPatternsSync,
  preloadAllPatterns,
} from './pattern-loader';

import { AiderAdapter } from './aider-adapter';
// Convenience function to register all adapters
import { ClaudeAdapter } from './claude-adapter';
import { CodexAdapter } from './codex-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { HermesAdapter } from './hermes-adapter';

/**
 * Create instances of all available adapters
 */
export function createAllAdapters() {
  return [
    new ClaudeAdapter(),
    new GeminiAdapter(),
    new CodexAdapter(),
    new AiderAdapter(),
    new HermesAdapter(),
  ];
}

/**
 * Adapter type to class mapping
 */
import type { AdapterType, AuthStatus } from './base-coding-adapter';

export const ADAPTER_TYPES: Record<
  AdapterType,
  | typeof ClaudeAdapter
  | typeof GeminiAdapter
  | typeof CodexAdapter
  | typeof AiderAdapter
  | typeof HermesAdapter
> = {
  claude: ClaudeAdapter,
  gemini: GeminiAdapter,
  codex: CodexAdapter,
  aider: AiderAdapter,
  hermes: HermesAdapter,
};

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
  /** Subscription/login auth status (only checked if installed) */
  auth?: AuthStatus;
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
export async function checkAdapters(
  types: AdapterType[]
): Promise<PreflightResult[]> {
  return Promise.all(
    types.map(async (type) => {
      const adapter = createAdapter(type);
      const validation = await adapter.validateInstallation();

      // Only check auth if the CLI is installed
      let auth: AuthStatus | undefined;
      if (validation.installed) {
        try {
          auth = await adapter.checkAuthStatus();
        } catch {
          auth = { status: 'unknown' };
        }
      }

      return {
        adapter: adapter.displayName,
        installed: validation.installed,
        version: validation.version,
        error: validation.error,
        installCommand: adapter.installation.command,
        docsUrl: adapter.installation.docsUrl,
        auth,
      };
    })
  );
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
export async function printMissingAdapters(
  types?: AdapterType[]
): Promise<void> {
  const results = types ? await checkAdapters(types) : await checkAllAdapters();
  const missing = results.filter((r) => !r.installed);

  if (missing.length === 0) {
    logger.info('All CLI tools are installed');
    return;
  }

  logger.info({ count: missing.length }, 'Missing CLI tools detected');
  for (const m of missing) {
    logger.warn(
      {
        adapter: m.adapter,
        installCommand: m.installCommand,
        docsUrl: m.docsUrl,
        ...(m.error ? { error: m.error } : {}),
      },
      'CLI tool not installed'
    );
  }
}
