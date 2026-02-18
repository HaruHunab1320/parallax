/**
 * Dynamic Pattern Loader
 *
 * Loads adapter patterns from @parallax/adapter-monitor snapshots when available,
 * with fallback to hardcoded baseline patterns.
 */

import type { AdapterType } from './types';

/**
 * Pattern set for an adapter
 */
export interface AdapterPatterns {
  /** Ready state detection patterns */
  ready: string[];
  /** Auth/login detection patterns */
  auth: string[];
  /** Blocking prompt detection patterns */
  blocking: string[];
  /** Source of patterns */
  source: 'snapshot' | 'baseline';
  /** Version these patterns are from (if from snapshot) */
  version?: string;
}

/**
 * Baseline hardcoded patterns - used when no snapshots available
 */
const BASELINE_PATTERNS: Record<AdapterType, AdapterPatterns> = {
  claude: {
    ready: [
      'Claude Code',
      'How can I help',
      'What would you like',
      'Ready',
    ],
    auth: [
      'ANTHROPIC_API_KEY',
      'API key not found',
      'authentication required',
      'Please sign in',
      'Invalid API key',
    ],
    blocking: [
      'update available',
      '[y/n]',
    ],
    source: 'baseline',
  },

  gemini: {
    ready: [
      'Type your message',
      'How can I help',
      'What would you like',
      'Ready',
    ],
    auth: [
      'GOOGLE_API_KEY',
      'GEMINI_API_KEY',
      'API key not found',
      'Sign in with Google',
      'gcloud auth',
      'Application Default Credentials',
    ],
    blocking: [
      'update available',
      '[y/n]',
    ],
    source: 'baseline',
  },

  codex: {
    ready: [
      'Codex',
      'How can I help',
      'Ready',
    ],
    auth: [
      'OPENAI_API_KEY',
      'API key not found',
      'Unauthorized',
      'Invalid API key',
    ],
    blocking: [
      'update available',
      '[y/n]',
    ],
    source: 'baseline',
  },

  aider: {
    ready: [
      'Aider',
      'What would you like',
      'Ready',
    ],
    auth: [
      'API key',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'No API key',
    ],
    blocking: [
      '(Y)es/(N)o',
      '[y/n]',
    ],
    source: 'baseline',
  },
};

/**
 * Cache for loaded patterns
 */
const patternCache: Map<string, AdapterPatterns> = new Map();

/**
 * Monitor patterns result shape (matches @parallax/adapter-monitor VersionPatternMapping)
 */
interface MonitorPatterns {
  version: string;
  readyPatterns: string[];
  authPatterns: string[];
  blockingPatterns: string[];
}

/**
 * Try to load patterns from @parallax/adapter-monitor
 */
async function tryLoadFromMonitor(
  adapter: AdapterType,
  version?: string
): Promise<AdapterPatterns | null> {
  try {
    // Dynamic import - will fail gracefully if package not installed
    // Uses string variable to avoid TypeScript trying to resolve the module
    const moduleName = 'agent-adapter-monitor';
    const monitor = await import(/* webpackIgnore: true */ moduleName) as {
      getPatternsForVersion: (
        adapter: string,
        version: string
      ) => Promise<MonitorPatterns | null>;
    };

    // Try to get patterns for specific version or latest
    const patterns = version
      ? await monitor.getPatternsForVersion(adapter, version)
      : await monitor.getPatternsForVersion(adapter, 'latest');

    if (patterns) {
      return {
        ready: patterns.readyPatterns || [],
        auth: patterns.authPatterns || [],
        blocking: patterns.blockingPatterns || [],
        source: 'snapshot',
        version: patterns.version,
      };
    }
  } catch {
    // Package not installed or no snapshots available - that's fine
  }

  return null;
}

/**
 * Load patterns for an adapter
 *
 * Tries to load from @parallax/adapter-monitor snapshots first,
 * falls back to hardcoded baseline patterns.
 *
 * @param adapter - Adapter type
 * @param version - Optional specific CLI version to load patterns for
 * @param forceRefresh - Skip cache and reload
 */
export async function loadPatterns(
  adapter: AdapterType,
  version?: string,
  forceRefresh = false
): Promise<AdapterPatterns> {
  const cacheKey = `${adapter}:${version || 'latest'}`;

  // Check cache first
  if (!forceRefresh && patternCache.has(cacheKey)) {
    return patternCache.get(cacheKey)!;
  }

  // Try loading from monitor
  const monitorPatterns = await tryLoadFromMonitor(adapter, version);

  if (monitorPatterns && monitorPatterns.ready.length > 0) {
    patternCache.set(cacheKey, monitorPatterns);
    return monitorPatterns;
  }

  // Fall back to baseline
  const baseline = BASELINE_PATTERNS[adapter];
  patternCache.set(cacheKey, baseline);
  return baseline;
}

/**
 * Load patterns synchronously (uses cache or baseline only)
 *
 * Use this in constructors or synchronous code paths.
 * For best results, call loadPatterns() asynchronously during init.
 */
export function loadPatternsSync(adapter: AdapterType): AdapterPatterns {
  const cacheKey = `${adapter}:latest`;

  // Return cached if available
  if (patternCache.has(cacheKey)) {
    return patternCache.get(cacheKey)!;
  }

  // Otherwise return baseline (don't cache - let async load update it)
  return BASELINE_PATTERNS[adapter];
}

/**
 * Preload patterns for all adapters
 *
 * Call this during application startup to warm the cache.
 */
export async function preloadAllPatterns(): Promise<void> {
  const adapters: AdapterType[] = ['claude', 'gemini', 'codex', 'aider'];

  await Promise.all(adapters.map((adapter) => loadPatterns(adapter)));
}

/**
 * Clear the pattern cache
 */
export function clearPatternCache(): void {
  patternCache.clear();
}

/**
 * Get baseline patterns (always available, no async)
 */
export function getBaselinePatterns(adapter: AdapterType): AdapterPatterns {
  return BASELINE_PATTERNS[adapter];
}

/**
 * Check if dynamic patterns are available
 */
export async function hasDynamicPatterns(adapter: AdapterType): Promise<boolean> {
  const patterns = await tryLoadFromMonitor(adapter);
  return patterns !== null;
}
