/**
 * Adapter Monitor Configuration
 *
 * Configuration for monitored CLI adapters.
 */

import type { AdapterType, CLIVersionSource } from './types';

/**
 * Monitored CLI adapters and their version sources
 */
export const MONITORED_CLIS: Record<AdapterType, CLIVersionSource> = {
  claude: {
    type: 'claude',
    registry: 'npm',
    package: '@anthropic-ai/claude-code',
    githubRepo: 'anthropics/claude-code',
    command: 'claude',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
  },

  gemini: {
    type: 'gemini',
    registry: 'npm',
    package: '@anthropic-ai/gemini-cli', // Placeholder - update when actual package known
    githubRepo: 'anthropics/gemini-cli',
    command: 'gemini',
    installCommand: 'npm install -g @anthropic-ai/gemini-cli',
  },

  codex: {
    type: 'codex',
    registry: 'npm',
    package: '@openai/codex', // Placeholder - update when actual package known
    githubRepo: 'openai/codex-cli',
    command: 'codex',
    installCommand: 'npm install -g @openai/codex',
  },

  aider: {
    type: 'aider',
    registry: 'pip',
    package: 'aider-chat',
    githubRepo: 'paul-gauthier/aider',
    command: 'aider',
    installCommand: 'pip install aider-chat',
  },
};

/**
 * Default capture options
 */
export const DEFAULT_CAPTURE_OPTIONS = {
  timeout: 30000,
  useDocker: true,
  captureAuth: false,
};

/**
 * Paths for snapshot storage
 */
export const SNAPSHOT_PATHS = {
  /** Base directory for snapshots */
  base: 'snapshots',

  /** Pattern: snapshots/{adapter}/{version}.json */
  snapshot: (adapter: AdapterType, version: string) =>
    `snapshots/${adapter}/${version.replace(/\./g, '_')}.json`,

  /** Version history file per adapter */
  history: (adapter: AdapterType) => `snapshots/${adapter}/history.json`,

  /** Latest symlink */
  latest: (adapter: AdapterType) => `snapshots/${adapter}/latest.json`,
};

/**
 * Known ready patterns per adapter (baseline - will be updated by monitoring)
 */
export const BASELINE_READY_PATTERNS: Record<AdapterType, string[]> = {
  claude: [
    'Claude Code',
    'How can I help',
    'What would you like',
    'Ready',
  ],

  gemini: [
    'Type your message',
    'How can I help',
    'What would you like',
    'Ready',
  ],

  codex: [
    'Codex',
    'How can I help',
    'Ready',
  ],

  aider: [
    'Aider',
    'What would you like',
    'Ready',
  ],
};

/**
 * Known auth patterns per adapter (baseline)
 */
export const BASELINE_AUTH_PATTERNS: Record<AdapterType, string[]> = {
  claude: [
    'ANTHROPIC_API_KEY',
    'API key not found',
    'authentication required',
    'Please sign in',
  ],

  gemini: [
    'GOOGLE_API_KEY',
    'GEMINI_API_KEY',
    'API key not found',
    'Sign in with Google',
    'gcloud auth',
  ],

  codex: [
    'OPENAI_API_KEY',
    'API key not found',
    'Unauthorized',
  ],

  aider: [
    'API key',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'No API key',
  ],
};
