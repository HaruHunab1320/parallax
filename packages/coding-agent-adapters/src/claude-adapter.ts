/**
 * Claude Code CLI Adapter
 *
 * Adapter for the Claude Code CLI (claude command).
 */

import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from 'pty-manager';
import { BaseCodingAdapter, type InstallationInfo, type ModelRecommendations, type AgentCredentials, type AgentFileDescriptor } from './base-coding-adapter';

export class ClaudeAdapter extends BaseCodingAdapter {
  readonly adapterType = 'claude';
  readonly displayName = 'Claude Code';

  readonly installation: InstallationInfo = {
    command: 'npm install -g @anthropic-ai/claude-code',
    alternatives: [
      'npx @anthropic-ai/claude-code (run without installing)',
      'brew install claude-code (macOS with Homebrew)',
    ],
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code',
    minVersion: '1.0.0',
  };

  /**
   * Auto-response rules for Claude Code CLI.
   * These handle common text-based [y/n] prompts that can be safely auto-responded.
   * Explicit responseType: 'text' prevents the usesTuiMenus default from kicking in.
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    {
      pattern: /trust.*folder|safety.?check|project.you.created/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Accept trust prompt for working directory',
      safe: true,
      once: true,
    },
    {
      pattern: /update available.*\[y\/n\]/i,
      type: 'update',
      response: 'n',
      responseType: 'text',
      description: 'Decline Claude Code update to continue execution',
      safe: true,
    },
    {
      pattern: /new version.*available.*\[y\/n\]/i,
      type: 'update',
      response: 'n',
      responseType: 'text',
      description: 'Decline version upgrade prompt',
      safe: true,
    },
    {
      pattern: /would you like to enable.*telemetry.*\[y\/n\]/i,
      type: 'config',
      response: 'n',
      responseType: 'text',
      description: 'Decline telemetry prompt',
      safe: true,
    },
    {
      pattern: /send anonymous usage data.*\[y\/n\]/i,
      type: 'config',
      response: 'n',
      responseType: 'text',
      description: 'Decline anonymous usage data',
      safe: true,
    },
    {
      pattern: /continue without.*\[y\/n\]/i,
      type: 'config',
      response: 'y',
      responseType: 'text',
      description: 'Continue without optional feature',
      safe: true,
    },
  ];

  getWorkspaceFiles(): AgentFileDescriptor[] {
    return [
      {
        relativePath: 'CLAUDE.md',
        description: 'Project-level instructions read automatically on startup',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: '.claude/settings.json',
        description: 'Project-scoped settings (allowed tools, permissions)',
        autoLoaded: true,
        type: 'config',
        format: 'json',
      },
      {
        relativePath: '.claude/commands',
        description: 'Custom slash commands directory',
        autoLoaded: false,
        type: 'config',
        format: 'markdown',
      },
    ];
  }

  getRecommendedModels(_credentials?: AgentCredentials): ModelRecommendations {
    return {
      powerful: 'claude-sonnet-4-20250514',
      fast: 'claude-haiku-4-5-20251001',
    };
  }

  getCommand(): string {
    return 'claude';
  }

  getArgs(config: SpawnConfig): string[] {
    const args: string[] = [];

    // Print mode for non-interactive usage (skip if interactive mode)
    if (!this.isInteractive(config)) {
      args.push('--print');

      // Set working directory in non-interactive mode
      // In interactive/PTY mode, the PTY's cwd is already set by spawn config
      if (config.workdir) {
        args.push('--cwd', config.workdir);
      }
    }

    // Append approval preset CLI flags
    const approvalConfig = this.getApprovalConfig(config);
    if (approvalConfig) {
      args.push(...approvalConfig.cliFlags);
    }

    return args;
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    const env: Record<string, string> = {};
    const credentials = this.getCredentials(config);

    // API key from credentials or env
    if (credentials.anthropicKey) {
      env.ANTHROPIC_API_KEY = credentials.anthropicKey;
    }

    // Model selection (if specified in config env)
    if (config.env?.ANTHROPIC_MODEL) {
      env.ANTHROPIC_MODEL = config.env.ANTHROPIC_MODEL;
    }

    // Disable interactive features for automation (skip if interactive mode)
    if (!this.isInteractive(config)) {
      env.CLAUDE_CODE_DISABLE_INTERACTIVE = 'true';
    }

    return env;
  }

  detectLogin(output: string): LoginDetection {
    const stripped = this.stripAnsi(output);

    // Check for API key issues
    if (
      stripped.includes('API key not found') ||
      stripped.includes('ANTHROPIC_API_KEY') ||
      stripped.includes('authentication required') ||
      stripped.includes('Please sign in') ||
      stripped.includes('Invalid API key')
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions: 'Set ANTHROPIC_API_KEY environment variable or provide credentials in adapterConfig',
      };
    }

    // Check for OAuth/browser login
    if (
      stripped.includes('Open this URL') ||
      stripped.includes('browser to authenticate')
    ) {
      const urlMatch = stripped.match(/https?:\/\/[^\s]+/);
      return {
        required: true,
        type: 'browser',
        url: urlMatch ? urlMatch[0] : undefined,
        instructions: 'Browser authentication required',
      };
    }

    return { required: false };
  }

  /**
   * Detect blocking prompts specific to Claude Code CLI
   */
  detectBlockingPrompt(output: string): BlockingPromptDetection {
    // Guard: if the output looks like a ready state, don't flag as blocking.
    // This prevents residual prompt text in the buffer from being misinterpreted
    // after the CLI has already moved past the blocking state.
    if (this.detectReady(output)) {
      return { detected: false };
    }

    const stripped = this.stripAnsi(output);

    // First check for login (highest priority)
    const loginDetection = this.detectLogin(output);
    if (loginDetection.required) {
      return {
        detected: true,
        type: 'login',
        prompt: loginDetection.instructions,
        url: loginDetection.url,
        canAutoRespond: false,
        instructions: loginDetection.instructions,
      };
    }

    // Claude-specific: Tool permission prompt (TUI menu — use keys:enter)
    if (/Do you want to|wants? (your )?permission|needs your permission/i.test(stripped)) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'Claude tool permission',
        suggestedResponse: 'keys:enter',
        canAutoRespond: true,
        instructions: 'Claude is asking permission to use a tool',
      };
    }

    // Claude-specific: Model selection prompt
    if (/choose.*model|select.*model|available models/i.test(stripped) &&
        /\d+\)|claude-/i.test(stripped)) {
      return {
        detected: true,
        type: 'model_select',
        prompt: 'Claude model selection',
        canAutoRespond: false,
        instructions: 'Please select a Claude model or set ANTHROPIC_MODEL env var',
      };
    }

    // Claude-specific: API key tier/plan selection
    if (/which.*tier|select.*plan|api.*tier/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'API tier selection',
        canAutoRespond: false,
        instructions: 'Please select an API tier',
      };
    }

    // Claude-specific: First-time setup wizard
    if (/welcome to claude|first time setup|initial configuration/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'First-time setup',
        canAutoRespond: false,
        instructions: 'Claude Code requires initial configuration',
      };
    }

    // Claude-specific: Permission to access files/directories
    if (/allow.*access|grant.*permission|access to .* files/i.test(stripped) &&
        /\[y\/n\]/i.test(stripped)) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'File/directory access permission',
        options: ['y', 'n'],
        suggestedResponse: 'y',
        canAutoRespond: true,
        instructions: 'Claude Code requesting file access permission',
      };
    }

    // Fall back to base class detection
    return super.detectBlockingPrompt(output);
  }

  /**
   * Detect task completion for Claude Code.
   *
   * High-confidence pattern: turn duration summary + idle prompt.
   * Claude Code shows "<Verb> for Xm Ys" (e.g. "Cooked for 3m 12s")
   * when a turn completes, followed by the ❯ input prompt.
   *
   * Patterns from: AGENT_LOADING_STATUS_PATTERNS.json
   *   - claude_completed_turn_duration
   *   - claude_completed_turn_duration_custom_verb
   */
  detectTaskComplete(output: string): boolean {
    const stripped = this.stripAnsi(output);

    // Turn duration pattern: "<Verb> for <duration>" (customizable verb)
    const hasDuration = /[A-Z][A-Za-z' -]{2,40}\s+for\s+\d+(?:h\s+\d{1,2}m\s+\d{1,2}s|m\s+\d{1,2}s|s)/.test(stripped);

    // Idle prompt: ❯ in the tail of the output.
    // The status bar (file counts, PR info, "Update available", etc.) renders
    // *after* the ❯ prompt in the TUI output stream, so we can't anchor to $.
    const tail = stripped.slice(-300);
    const hasIdlePrompt = /❯/.test(tail);

    // High confidence: duration summary + idle prompt
    if (hasDuration && hasIdlePrompt) {
      return true;
    }

    // Medium confidence: idle prompt with "for shortcuts" hint (post-task state)
    if (hasIdlePrompt && stripped.includes('for shortcuts')) {
      return true;
    }

    return false;
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);

    // Guard: if the output contains a trust prompt, we're NOT ready yet —
    // the user (or auto-response) still needs to confirm.
    if (/trust.*directory|do you want to|needs? your permission/i.test(stripped)) {
      return false;
    }

    // Claude Code shows a prompt when ready
    // Only match specific interactive prompts, not banner text like "Claude Code"
    // or generic words like "Ready" which appear alongside auth/trust screens
    // Check the tail for prompt patterns — the status bar (file counts,
    // PR info, "Update available", etc.) renders *after* the prompt in the
    // TUI output stream, so we can't anchor to $.
    const tail = stripped.slice(-300);
    return (
      stripped.includes('How can I help') ||
      stripped.includes('What would you like') ||
      // v2.1+ shows "for shortcuts" hint when ready
      stripped.includes('for shortcuts') ||
      // Match "claude> " or similar specific prompts, not bare ">"
      /claude>/i.test(tail) ||
      // v2.1+ uses ❯ as the input prompt
      /❯/.test(tail)
    );
  }

  parseOutput(output: string): ParsedOutput | null {
    const stripped = this.stripAnsi(output);

    // Check if this looks like a complete response
    const isComplete = this.isResponseComplete(stripped);

    if (!isComplete) {
      return null;
    }

    // Determine if this is a question
    const isQuestion = this.containsQuestion(stripped);

    // Extract the actual content
    const content = this.extractContent(stripped, /^.*>\s*/gm);

    return {
      type: isQuestion ? 'question' : 'response',
      content,
      isComplete: true,
      isQuestion,
      metadata: {
        raw: output,
      },
    };
  }

  getPromptPattern(): RegExp {
    // Claude Code prompt patterns
    // Match "claude> " specifically, not bare ">" which is too broad
    return /claude>\s*$/i;
  }

  getHealthCheckCommand(): string {
    return 'claude --version';
  }
}
