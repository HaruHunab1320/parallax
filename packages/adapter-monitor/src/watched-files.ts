/**
 * Watched Files Configuration
 *
 * Maps each CLI to the specific source files that contain prompt, auth, ready,
 * and exit logic. Derived from deep-research analysis of each CLI's open-source
 * repository (see coding-agent-adapters/src/data/*_prompt_catalog.json).
 *
 * When a new CLI version is released, only these files need to be checked for
 * changes — if none changed, the adapter patterns are still valid.
 */

import type { AdapterType, WatchedFileConfig } from './types';

/**
 * Watched file configurations per CLI adapter.
 *
 * Each entry lists the repo-relative source files that the deep-research agent
 * identified as containing blocking prompts, ready detection, exit detection,
 * auth flows, or framework rendering logic.
 */
export const WATCHED_FILES: Record<AdapterType, WatchedFileConfig> = {
  gemini: {
    adapter: 'gemini',
    githubRepo: 'google-gemini/gemini-cli',
    watchedFiles: [
      // Auth
      { path: 'packages/cli/src/ui/auth/AuthDialog.tsx', category: 'auth' },
      { path: 'packages/cli/src/ui/auth/ApiAuthDialog.tsx', category: 'auth' },
      { path: 'packages/cli/src/ui/auth/AuthInProgress.tsx', category: 'auth' },
      { path: 'packages/cli/src/config/auth.ts', category: 'auth' },
      { path: 'packages/cli/src/validateNonInterActiveAuth.ts', category: 'auth' },

      // Blocking prompts
      { path: 'packages/cli/src/ui/components/FolderTrustDialog.tsx', category: 'blocking_prompt' },
      { path: 'packages/cli/src/ui/components/MultiFolderTrustDialog.tsx', category: 'blocking_prompt' },
      { path: 'packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx', category: 'blocking_prompt' },
      { path: 'packages/cli/src/ui/components/ValidationDialog.tsx', category: 'blocking_prompt' },
      { path: 'packages/cli/src/ui/utils/updateCheck.ts', category: 'blocking_prompt' },
      { path: 'packages/cli/src/ui/privacy/CloudFreePrivacyNotice.tsx', category: 'blocking_prompt' },

      // Ready detection
      { path: 'packages/cli/src/ui/components/InputPrompt.tsx', category: 'ready_detection' },
      { path: 'packages/cli/src/ui/components/Composer.tsx', category: 'ready_detection' },

      // Exit detection
      { path: 'packages/cli/src/ui/components/LogoutConfirmationDialog.tsx', category: 'exit_detection' },

      // Framework / rendering
      { path: 'packages/cli/src/gemini.tsx', category: 'framework' },
      { path: 'packages/cli/src/ui/components/CliSpinner.tsx', category: 'framework' },

      // Startup
      { path: 'packages/cli/src/ui/components/Tips.tsx', category: 'startup' },
      { path: 'packages/cli/src/utils/userStartupWarnings.ts', category: 'startup' },
    ],
  },

  codex: {
    adapter: 'codex',
    githubRepo: 'openai/codex',
    watchedFiles: [
      // Auth
      { path: 'codex-rs/tui/src/onboarding/auth.rs', category: 'auth' },
      { path: 'codex-rs/tui/src/onboarding/auth/headless_chatgpt_login.rs', category: 'auth' },
      { path: 'codex-rs/cli/src/login.rs', category: 'auth' },

      // Blocking prompts
      { path: 'codex-rs/tui/src/onboarding/trust_directory.rs', category: 'blocking_prompt' },
      { path: 'codex-rs/tui/src/bottom_pane/approval_overlay.rs', category: 'blocking_prompt' },
      { path: 'codex-rs/tui/src/update_prompt.rs', category: 'blocking_prompt' },
      { path: 'codex-rs/tui/src/cwd_prompt.rs', category: 'blocking_prompt' },
      { path: 'codex-rs/tui/src/model_migration.rs', category: 'blocking_prompt' },
      { path: 'codex-rs/tui/src/chatwidget.rs', category: 'blocking_prompt' },
      { path: 'codex-rs/tui/src/bottom_pane/request_user_input/mod.rs', category: 'blocking_prompt' },
      { path: 'codex-rs/cli/src/main.rs', category: 'blocking_prompt' },

      // Ready detection
      { path: 'codex-rs/tui/src/bottom_pane/chat_composer.rs', category: 'ready_detection' },

      // Startup
      { path: 'codex-rs/tui/src/onboarding/welcome.rs', category: 'startup' },

      // Framework / rendering
      { path: 'codex-rs/tui/src/exec_cell/render.rs', category: 'framework' },
      { path: 'codex-rs/tui/src/oss_selection.rs', category: 'framework' },
    ],
  },

  aider: {
    adapter: 'aider',
    githubRepo: 'Aider-AI/aider',
    watchedFiles: [
      // Auth / onboarding
      { path: 'aider/onboarding.py', category: 'auth' },
      { path: 'aider/models.py', category: 'auth' },

      // Blocking prompts (io.py is the main confirmation helper)
      { path: 'aider/io.py', category: 'blocking_prompt' },
      { path: 'aider/main.py', category: 'blocking_prompt' },
      { path: 'aider/coders/base_coder.py', category: 'blocking_prompt' },
      { path: 'aider/coders/architect_coder.py', category: 'blocking_prompt' },
      { path: 'aider/commands.py', category: 'blocking_prompt' },
      { path: 'aider/utils.py', category: 'blocking_prompt' },
      { path: 'aider/scrape.py', category: 'blocking_prompt' },
      { path: 'aider/report.py', category: 'blocking_prompt' },

      // Exit detection
      { path: 'aider/versioncheck.py', category: 'exit_detection' },

      // Framework / rendering
      { path: 'aider/waiting.py', category: 'framework' },
    ],
  },

  claude: {
    adapter: 'claude',
    githubRepo: 'anthropics/claude-code',
    watchedFiles: [
      // Limited data — the checkout analyzed only contained docs/changelog/plugins.
      // Runtime UI source was not available. These are placeholder references.
      { path: 'CHANGELOG.md', category: 'blocking_prompt' },
      { path: 'README.md', category: 'startup' },
    ],
  },
};

/**
 * Get watched files for a specific adapter
 */
export function getWatchedFiles(adapter: AdapterType): WatchedFileConfig {
  return WATCHED_FILES[adapter];
}

/**
 * Get watched files filtered by category
 */
export function getWatchedFilesByCategory(
  adapter: AdapterType,
  category: 'blocking_prompt' | 'ready_detection' | 'exit_detection' | 'auth' | 'framework' | 'startup',
): string[] {
  return WATCHED_FILES[adapter].watchedFiles
    .filter(f => f.category === category)
    .map(f => f.path);
}
