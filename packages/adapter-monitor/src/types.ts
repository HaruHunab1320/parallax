/**
 * Adapter Monitor Types
 *
 * Types for CLI version monitoring, snapshot capture, and pattern analysis.
 */

/**
 * Supported CLI adapter types
 */
export type AdapterType = 'claude' | 'gemini' | 'codex' | 'aider';

/**
 * Package registry source types
 */
export type RegistryType = 'npm' | 'pip' | 'github';

/**
 * CLI version source configuration
 */
export interface CLIVersionSource {
  /** Adapter type identifier */
  type: AdapterType;

  /** Registry where package is published */
  registry: RegistryType;

  /** Package name in the registry */
  package: string;

  /** GitHub repo for release monitoring (owner/repo) */
  githubRepo?: string;

  /** Command to run the CLI */
  command: string;

  /** Install command for Docker */
  installCommand: string;

  /** Current known version */
  currentVersion?: string;
}

/**
 * Detected pattern from startup output
 */
export interface DetectedPattern {
  /** Pattern type */
  type: 'ready' | 'auth' | 'blocking' | 'update' | 'prompt';

  /** The actual text/pattern detected */
  text: string;

  /** Suggested regex pattern */
  regex?: string;

  /** Line number in output */
  lineNumber?: number;

  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Startup snapshot captured from a CLI
 */
export interface StartupSnapshot {
  /** Adapter type */
  adapter: AdapterType;

  /** CLI version */
  version: string;

  /** Capture timestamp */
  timestamp: string;

  /** Duration of capture in ms */
  captureDurationMs: number;

  /** Raw PTY output with ANSI codes */
  rawOutput: string;

  /** ANSI-stripped output */
  strippedOutput: string;

  /** Output split into lines */
  lines: string[];

  /** Detected patterns */
  patterns: DetectedPattern[];

  /** Whether auth was required */
  authRequired: boolean;

  /** Whether the CLI reached ready state */
  reachedReady: boolean;

  /** Any errors during capture */
  errors?: string[];
}

/**
 * Version mapping entry - maps CLI version to its patterns
 */
export interface VersionPatternMapping {
  /** CLI version */
  version: string;

  /** When this version was first captured */
  firstCaptured: string;

  /** When patterns were last updated */
  lastUpdated: string;

  /** Ready state detection patterns */
  readyPatterns: string[];

  /** Auth prompt detection patterns */
  authPatterns: string[];

  /** Blocking prompt detection patterns */
  blockingPatterns: string[];

  /** Update notice patterns */
  updatePatterns: string[];

  /** The snapshot that generated these patterns */
  snapshotFile?: string;
}

/**
 * Full version history for an adapter
 */
export interface AdapterVersionHistory {
  /** Adapter type */
  adapter: AdapterType;

  /** Latest known version */
  latestVersion: string;

  /** Version mappings keyed by version */
  versions: Record<string, VersionPatternMapping>;
}

/**
 * Pattern diff when comparing versions
 */
export interface PatternDiff {
  /** Adapter type */
  adapter: AdapterType;

  /** Old version */
  oldVersion: string;

  /** New version */
  newVersion: string;

  /** Added patterns */
  added: {
    ready: string[];
    auth: string[];
    blocking: string[];
  };

  /** Removed patterns */
  removed: {
    ready: string[];
    auth: string[];
    blocking: string[];
  };

  /** Whether this is a breaking change */
  isBreaking: boolean;

  /** Human-readable summary */
  summary: string;
}

/**
 * Version check result
 */
export interface VersionCheckResult {
  /** Adapter type */
  adapter: AdapterType;

  /** Current known version */
  currentVersion: string | null;

  /** Latest available version */
  latestVersion: string;

  /** Whether an update is available */
  updateAvailable: boolean;

  /** Changelog URL if available */
  changelogUrl?: string;
}

/**
 * Capture options
 */
export interface CaptureOptions {
  /** Timeout for capture in ms (default: 30000) */
  timeout?: number;

  /** Whether to use Docker isolation (default: true) */
  useDocker?: boolean;

  /** Custom Docker image */
  dockerImage?: string;

  /** Environment variables to set */
  env?: Record<string, string>;

  /** Whether to capture auth flow (requires interaction) */
  captureAuth?: boolean;
}

/**
 * Analysis result from pattern extraction
 */
export interface AnalysisResult {
  /** The snapshot that was analyzed */
  snapshot: StartupSnapshot;

  /** Suggested patterns for detectReady */
  suggestedReadyPatterns: string[];

  /** Suggested patterns for detectLogin */
  suggestedAuthPatterns: string[];

  /** Suggested patterns for detectBlockingPrompt */
  suggestedBlockingPatterns: string[];

  /** Confidence in the analysis */
  confidence: number;

  /** Notes/warnings about the analysis */
  notes: string[];
}

/**
 * A source file to watch for changes in a CLI's repository.
 * Derived from deep-research analysis of the CLI's source code.
 */
export interface WatchedFile {
  /** Repo-relative path (e.g. "packages/cli/src/ui/auth/AuthDialog.tsx") */
  path: string;

  /** What this file controls */
  category: 'blocking_prompt' | 'ready_detection' | 'exit_detection' | 'auth' | 'framework' | 'startup';
}

/**
 * Per-CLI watched file configuration
 */
export interface WatchedFileConfig {
  /** Adapter type */
  adapter: AdapterType;

  /** GitHub repo in owner/repo format */
  githubRepo: string;

  /** Files to monitor for prompt/pattern changes */
  watchedFiles: WatchedFile[];
}

/**
 * Result of checking file changes between versions
 */
export interface FileChangeResult {
  /** Adapter type */
  adapter: AdapterType;

  /** Old version (tag) */
  oldVersion: string;

  /** New version (tag) */
  newVersion: string;

  /** Files that changed between versions */
  changedFiles: Array<{
    /** Repo-relative path */
    path: string;

    /** What this file controls */
    category: WatchedFile['category'];

    /** Change type from GitHub */
    status: 'added' | 'modified' | 'removed' | 'renamed';
  }>;

  /** Whether adapter updates are likely needed */
  adapterUpdateNeeded: boolean;

  /** Human-readable summary */
  summary: string;
}
