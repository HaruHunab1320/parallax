/**
 * Aider CLI Adapter
 *
 * Adapter for the Aider AI pair programming tool.
 * https://github.com/paul-gauthier/aider
 */

import type {
  AutoResponseRule,
  BlockingPromptDetection,
  LoginDetection,
  ParsedOutput,
  SpawnConfig,
} from 'adapter-types';
import {
  type AgentCredentials,
  type AgentFileDescriptor,
  BaseCodingAdapter,
  type InstallationInfo,
  type ModelRecommendations,
} from './base-coding-adapter';

export class AiderAdapter extends BaseCodingAdapter {
  readonly adapterType = 'aider';
  readonly displayName = 'Aider';

  /** Minimal TUI, mostly text output — shorter settle delay */
  override readonly readySettleMs: number = 200;

  /**
   * Aider uses plain text [y/n] prompts, NOT TUI arrow-key menus.
   */
  override readonly usesTuiMenus: boolean = false;

  readonly installation: InstallationInfo = {
    command: 'pip install aider-chat',
    alternatives: [
      'pipx install aider-chat (isolated install)',
      'brew install aider (macOS with Homebrew)',
    ],
    docsUrl: 'https://aider.chat/docs/install.html',
    minVersion: '0.50.0',
  };

  /**
   * Auto-response rules for Aider CLI.
   * Aider uses plain text prompts via io.py:832 with (Y)es/(N)o format.
   * All rules are responseType: 'text' — Aider never uses TUI menus.
   *
   * Decline rules come first to override the generic accept patterns.
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    // ── Decline rules (specific, checked first) ────────────────────────
    {
      pattern: /allow collection of anonymous analytics/i,
      type: 'config',
      response: 'n',
      responseType: 'text',
      description: 'Decline Aider telemetry opt-in',
      safe: true,
      once: true,
    },
    {
      pattern: /would you like to see what.?s new in this version/i,
      type: 'config',
      response: 'n',
      responseType: 'text',
      description: 'Decline release notes offer',
      safe: true,
      once: true,
    },
    {
      pattern: /open a github issue pre-filled/i,
      type: 'config',
      response: 'n',
      responseType: 'text',
      description: 'Decline automatic bug report',
      safe: true,
    },
    {
      pattern: /open documentation url for more info\?/i,
      type: 'config',
      response: 'n',
      responseType: 'text',
      description: 'Decline opening Aider documentation for model warnings',
      safe: true,
    },
    // ── File / edit operations ──────────────────────────────────────────
    {
      pattern: /add .+ to the chat\?/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Allow Aider to add files to chat context',
      safe: true,
    },
    {
      pattern: /add url to the chat\?/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Allow Aider to add URL content to chat',
      safe: true,
    },
    {
      pattern: /create new file\?/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Allow Aider to create new files',
      safe: true,
    },
    {
      pattern: /allow edits to file/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Allow edits to file not yet in chat',
      safe: true,
    },
    {
      pattern: /edit the files\?/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Accept architect mode edits',
      safe: true,
    },
    // ── Shell operations ────────────────────────────────────────────────
    {
      pattern: /run shell commands?\?/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Allow Aider to run shell commands',
      safe: true,
    },
    {
      pattern: /add command output to the chat\?/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Add shell command output to chat context',
      safe: true,
    },
    {
      pattern: /add \d+.*tokens of command output to the chat\?/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Add /run command output to chat context',
      safe: true,
    },
    // ── Setup / maintenance ─────────────────────────────────────────────
    {
      pattern: /no git repo found.*create one/i,
      type: 'config',
      response: 'y',
      responseType: 'text',
      description: 'Create git repo for change tracking',
      safe: true,
      once: true,
    },
    {
      pattern: /add .+ to \.gitignore/i,
      type: 'config',
      response: 'y',
      responseType: 'text',
      description: 'Update .gitignore with Aider patterns',
      safe: true,
      once: true,
    },
    {
      pattern: /run pip install\?/i,
      type: 'config',
      response: 'y',
      responseType: 'text',
      description: 'Install missing Python dependencies',
      safe: true,
    },
    {
      pattern: /install playwright\?/i,
      type: 'config',
      response: 'y',
      responseType: 'text',
      description: 'Install Playwright for web scraping',
      safe: true,
    },
    // ── Other safe confirmations ────────────────────────────────────────
    {
      pattern: /fix lint errors in/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Accept lint error fix suggestion',
      safe: true,
    },
    {
      pattern: /try to proceed anyway\?/i,
      type: 'config',
      response: 'y',
      responseType: 'text',
      description: 'Continue despite context limit warning',
      safe: true,
    },
  ];

  getWorkspaceFiles(): AgentFileDescriptor[] {
    return [
      {
        relativePath: '.aider.conventions.md',
        description:
          'Project conventions and instructions read on startup (--read flag)',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: '.aider.conf.yml',
        description:
          'Project-scoped Aider configuration (model, flags, options)',
        autoLoaded: true,
        type: 'config',
        format: 'yaml',
      },
      {
        relativePath: '.aiderignore',
        description: 'Gitignore-style file listing paths Aider should not edit',
        autoLoaded: true,
        type: 'rules',
        format: 'text',
      },
    ];
  }

  getRecommendedModels(credentials?: AgentCredentials): ModelRecommendations {
    if (credentials?.anthropicKey) {
      return {
        powerful: 'anthropic/claude-sonnet-4-20250514',
        fast: 'anthropic/claude-haiku-4-5-20251001',
      };
    }
    if (credentials?.openaiKey) {
      return {
        powerful: 'openai/o3',
        fast: 'openai/gpt-4o-mini',
      };
    }
    if (credentials?.googleKey) {
      return {
        powerful: 'gemini/gemini-3-pro',
        fast: 'gemini/gemini-3-flash',
      };
    }
    // Default to Anthropic
    return {
      powerful: 'anthropic/claude-sonnet-4-20250514',
      fast: 'anthropic/claude-haiku-4-5-20251001',
    };
  }

  getCommand(): string {
    return 'aider';
  }

  getArgs(config: SpawnConfig): string[] {
    const args: string[] = [];
    const interactive = this.isInteractive(config);

    if (!interactive) {
      // Use auto-commits to avoid manual git operations in automation mode.
      args.push('--auto-commits');

      // Disable pretty output for easier parsing (automation mode only).
      args.push('--no-pretty');
      args.push('--no-show-diffs');
    }

    // Suppress model warnings when using a proxy (keys won't match expected format)
    const creds = this.getCredentials(config);
    if (creds.anthropicBaseUrl || creds.openaiBaseUrl) {
      args.push('--no-show-model-warnings');
    }

    // Set working directory via --file flag prefix
    // Aider uses current directory, so we rely on PTY cwd

    // Model: explicit > provider metadata > inferred from credentials > aider default
    // Aliases (sonnet, 4o, gemini) are maintained by Aider and auto-update
    const provider = (config.adapterConfig as { provider?: string } | undefined)
      ?.provider;
    const credentials = this.getCredentials(config);
    if (config.env?.AIDER_MODEL) {
      args.push('--model', config.env.AIDER_MODEL);
    } else if (provider === 'anthropic' || (!provider && credentials.anthropicKey && !credentials.googleKey)) {
      args.push('--model', 'sonnet');
    } else if (provider === 'openai' || (!provider && credentials.openaiKey && !credentials.anthropicKey)) {
      args.push('--model', '4o');
    } else if (provider === 'google' || (!provider && credentials.googleKey)) {
      args.push('--model', 'gemini');
    }
    // No provider or keys → don't force a model, let aider use its own default

    // API keys via --api-key flag only in automation mode.
    if (!interactive) {
      if (credentials.anthropicKey)
        args.push('--api-key', `anthropic=${credentials.anthropicKey}`);
      if (credentials.openaiKey)
        args.push('--api-key', `openai=${credentials.openaiKey}`);
      if (credentials.googleKey)
        args.push('--api-key', `gemini=${credentials.googleKey}`);

      // Base URL override (e.g. cloud proxy) — CLI flag for automation mode
      if (credentials.openaiBaseUrl) {
        args.push('--openai-api-base', credentials.openaiBaseUrl);
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
    // API keys are passed via --api-key args in automation mode,
    // but env vars are needed for interactive mode and base URL overrides.
    const env: Record<string, string> = {};
    const credentials = this.getCredentials(config);

    // When a proxy base URL is set, litellm needs both provider keys
    // and base URLs since it routes by model name (anthropic models
    // use ANTHROPIC_API_KEY, openai models use OPENAI_API_KEY).
    if (credentials.anthropicBaseUrl) {
      env.ANTHROPIC_API_BASE = credentials.anthropicBaseUrl;
    }
    if (credentials.openaiBaseUrl) {
      env.OPENAI_API_BASE = credentials.openaiBaseUrl;
    }
    // Set API keys via env for interactive mode (--api-key flags only work in automation)
    if (this.isInteractive(config)) {
      if (credentials.anthropicKey) {
        env.ANTHROPIC_API_KEY = credentials.anthropicKey;
      }
      if (credentials.openaiKey) {
        env.OPENAI_API_KEY = credentials.openaiKey;
      }
      if (credentials.googleKey) {
        env.GEMINI_API_KEY = credentials.googleKey;
      }
    }

    // Disable color for parsing (skip if interactive mode)
    if (!this.isInteractive(config)) {
      env.NO_COLOR = '1';
    }

    // Disable git integration if not wanted
    if (config.env?.AIDER_NO_GIT === 'true') {
      env.AIDER_NO_GIT = 'true';
    }

    return env;
  }

  detectLogin(output: string): LoginDetection {
    const stripped = this.stripAnsi(output);

    // Check for missing API keys
    if (
      stripped.includes('No API key') ||
      stripped.includes('API key not found') ||
      stripped.includes('ANTHROPIC_API_KEY') ||
      stripped.includes('OPENAI_API_KEY') ||
      stripped.includes('Missing API key')
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions:
          'Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable',
      };
    }

    // Check for invalid API key
    if (
      stripped.includes('Invalid API key') ||
      stripped.includes('Authentication failed') ||
      stripped.includes('Unauthorized')
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions: 'API key is invalid - please check your credentials',
      };
    }

    // OpenRouter OAuth login offer (onboarding.py:94)
    if (/login to openrouter or create a free account/i.test(stripped)) {
      return {
        required: true,
        type: 'oauth',
        instructions:
          'Aider offering OpenRouter OAuth login — provide API keys to skip',
      };
    }

    // OpenRouter OAuth browser flow in progress (onboarding.py:311)
    if (
      /please open this url in your browser to connect aider with openrouter/i.test(
        stripped
      ) ||
      /waiting up to 5 minutes for you to finish in the browser/i.test(stripped)
    ) {
      const urlMatch = stripped.match(/https?:\/\/[^\s]+/);
      return {
        required: true,
        type: 'browser',
        url: urlMatch ? urlMatch[0] : undefined,
        instructions: 'Complete OpenRouter authentication in browser',
      };
    }

    return { required: false };
  }

  /**
   * Detect blocking prompts specific to Aider CLI.
   *
   * IMPORTANT: Does NOT fall back to base class detection because the base
   * class has broad heuristics (any line ending with "?") that trigger on
   * normal LLM output. Aider uses --yes-always to auto-accept most prompts,
   * so we only need to detect auth/login and the few prompts that bypass it.
   *
   * Source: io.py, onboarding.py, base_coder.py, report.py
   */
  detectBlockingPrompt(output: string): BlockingPromptDetection {
    const stripped = this.stripAnsi(output);

    // Auth / login (highest priority)
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

    // Model selection (onboarding — not handled by --yes-always)
    if (/select.*model|choose.*model|which model/i.test(stripped)) {
      return {
        detected: true,
        type: 'model_select',
        prompt: 'Model selection required',
        canAutoRespond: false,
        instructions: 'Please select a model or set AIDER_MODEL env var',
      };
    }

    // Confirmation validation error — re-prompt loop (io.py:897)
    if (/please answer with one of:/i.test(stripped)) {
      return {
        detected: true,
        type: 'unknown',
        prompt: 'Invalid confirmation input',
        canAutoRespond: false,
        instructions:
          'Aider received an invalid response to a confirmation prompt',
      };
    }

    // Explicit y/n prompt NOT already handled by --yes-always
    // (e.g. destructive ops, git reset confirmations)
    if (
      /\[y\/n\]/i.test(stripped) || /\(Y\)es\/\(N\)o/i.test(stripped)
    ) {
      return {
        detected: true,
        type: 'permission',
        prompt: stripped.slice(-200),
        options: ['y', 'n'],
        canAutoRespond: false,
        instructions: 'Aider is asking for confirmation',
      };
    }

    // No blocking prompt detected — normal output
    return { detected: false };
  }

  /**
   * Detect if Aider is actively loading/processing.
   *
   * Patterns from: AGENT_LOADING_STATUS_PATTERNS.json
   *   - aider_active_waiting_model: "Waiting for <model>"
   *   - aider_active_waiting_llm_default: "Waiting for LLM"
   *   - aider_active_generating_commit_message: "Generating commit message with ..."
   */
  detectLoading(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const tail = stripped.slice(-500);

    // Waiting for model response
    if (/Waiting\s+for\s+(?:LLM|[A-Za-z0-9_./:@-]+)/i.test(tail)) {
      return true;
    }

    // Generating commit message
    if (/Generating\s+commit\s+message\s+with\s+/i.test(tail)) {
      return true;
    }

    return false;
  }

  /**
   * Detect task completion for Aider.
   *
   * High-confidence patterns:
   *   - "Aider is waiting for your input" notification (bell message)
   *   - Edit-format mode prompts (ask>, code>, architect>) after output
   *
   * Patterns from: AGENT_LOADING_STATUS_PATTERNS.json
   *   - aider_completed_llm_response_ready
   */
  detectTaskComplete(output: string): boolean {
    const stripped = this.stripAnsi(output);

    // "Aider is waiting for your input" — explicit notification that model turn finished
    if (/Aider\s+is\s+waiting\s+for\s+your\s+input/.test(stripped)) {
      return true;
    }

    // Mode prompt at end of output after visible response content.
    // Only count as task-complete if there's substantial output above the prompt
    // (not just a bare prompt which could be startup).
    // Match named prompts (ask>, code>, architect>, multi>) AND plain >
    // Aider shows plain > in some modes.
    const hasPrompt = /(?:(?:ask|code|architect)(?:\s+multi)?)?>\s*$/m.test(
      stripped
    );
    if (hasPrompt) {
      // Check for signs of completed work above the prompt
      const hasEditMarkers =
        /Applied edit to|Commit [a-f0-9]+|wrote to|Updated/i.test(stripped);
      const hasTokenUsage = /Tokens:|Cost:/i.test(stripped);
      if (hasEditMarkers || hasTokenUsage) {
        return true;
      }
    }

    return false;
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);

    // Guard: if output contains an auth/OAuth prompt, we're NOT ready
    if (
      /login to openrouter/i.test(stripped) ||
      /open this url in your browser/i.test(stripped) ||
      /waiting up to 5 minutes/i.test(stripped)
    ) {
      return false;
    }

    // Edit-format mode prompts (io.py:545): ask>, code>, architect>, help>, multi>
    if (
      /(?:ask|code|architect|help)(?:\s+multi)?>\s*$/m.test(stripped) ||
      /^multi>\s*$/m.test(stripped)
    ) {
      return true;
    }

    // Startup banner indicates Aider launched (base_coder.py:209)
    if (/^Aider v\d+/m.test(stripped)) {
      return true;
    }

    // File list display means chat context is ready
    if (/^(?:Readonly|Editable):/m.test(stripped)) {
      return true;
    }

    return (
      // Legacy prompt patterns
      stripped.includes('aider>') ||
      /Added.*to the chat/i.test(stripped) ||
      />\s*$/.test(stripped)
    );
  }

  parseOutput(output: string): ParsedOutput | null {
    const stripped = this.stripAnsi(output);

    const isComplete = this.isResponseComplete(stripped);

    if (!isComplete) {
      return null;
    }

    const isQuestion = this.containsQuestion(stripped);

    // Extract content, removing aider prompt
    let content = this.extractContent(stripped, /^.*aider>\s*/gim);

    // Remove file operation confirmations from content
    content = content.replace(
      /^(Added|Removed|Created|Updated) .+ (to|from) the chat\.?$/gm,
      ''
    );

    return {
      type: isQuestion ? 'question' : 'response',
      content: content.trim(),
      isComplete: true,
      isQuestion,
      metadata: {
        raw: output,
      },
    };
  }

  /**
   * Detect exit conditions specific to Aider.
   * Source: base_coder.py:994, base_coder.py:998, report.py:77, versioncheck.py:58
   */
  override detectExit(output: string): {
    exited: boolean;
    code?: number;
    error?: string;
  } {
    const stripped = this.stripAnsi(output);

    // Ctrl+C exit (base_coder.py:994-998)
    if (
      /\^C again to exit/i.test(stripped) ||
      /\^C KeyboardInterrupt/i.test(stripped)
    ) {
      return { exited: true, code: 130 };
    }

    // Version update completed (versioncheck.py:58)
    if (/re-run aider to use new version/i.test(stripped)) {
      return {
        exited: true,
        code: 0,
        error: 'Aider updated — restart required',
      };
    }

    return super.detectExit(output);
  }

  getPromptPattern(): RegExp {
    // Match edit-format prompts: ask>, code>, architect>, help>, multi>
    // Also legacy aider> and bare >
    return /(?:ask|code|architect|help|aider|multi)(?:\s+multi)?>\s*$/i;
  }

  getHealthCheckCommand(): string {
    return 'aider --version';
  }
}
