/**
 * Aider CLI Adapter
 *
 * Adapter for the Aider AI pair programming tool.
 * https://github.com/paul-gauthier/aider
 */

import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from 'pty-manager';
import { BaseCodingAdapter, type InstallationInfo, type ModelRecommendations, type AgentCredentials, type AgentFileDescriptor } from './base-coding-adapter';

export class AiderAdapter extends BaseCodingAdapter {
  readonly adapterType = 'aider';
  readonly displayName = 'Aider';

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
        description: 'Project conventions and instructions read on startup (--read flag)',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: '.aider.conf.yml',
        description: 'Project-scoped Aider configuration (model, flags, options)',
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

    // Use auto-commits to avoid manual git operations
    args.push('--auto-commits');

    // Disable pretty output for easier parsing (skip if interactive mode)
    if (!this.isInteractive(config)) {
      args.push('--no-pretty');
      // Don't show diffs (we'll handle this separately if needed)
      args.push('--no-show-diffs');
    }

    // Set working directory via --file flag prefix
    // Aider uses current directory, so we rely on PTY cwd

    // Model: explicit > provider metadata > inferred from API keys > aider default
    // Aliases (sonnet, 4o, gemini) are maintained by Aider and auto-update
    const provider = (config.adapterConfig as { provider?: string } | undefined)?.provider;
    const credentials = this.getCredentials(config);
    if (config.env?.AIDER_MODEL) {
      args.push('--model', config.env.AIDER_MODEL);
    } else if (provider === 'anthropic') {
      args.push('--model', 'sonnet');
    } else if (provider === 'openai') {
      args.push('--model', '4o');
    } else if (provider === 'google') {
      args.push('--model', 'gemini');
    } else if (credentials.anthropicKey) {
      // No explicit provider — infer from available API keys
      args.push('--model', 'sonnet');
    } else if (credentials.openaiKey) {
      args.push('--model', '4o');
    } else if (credentials.googleKey) {
      args.push('--model', 'gemini');
    }
    // No keys at all → don't force a model, let aider use its own default

    // API keys via --api-key flag (no env vars needed)
    if (credentials.anthropicKey) args.push('--api-key', `anthropic=${credentials.anthropicKey}`);
    if (credentials.openaiKey) args.push('--api-key', `openai=${credentials.openaiKey}`);
    if (credentials.googleKey) args.push('--api-key', `gemini=${credentials.googleKey}`);

    return args;
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    // API keys are passed via --api-key args, not env vars
    const env: Record<string, string> = {};

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
        instructions: 'Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable',
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
        instructions: 'Aider offering OpenRouter OAuth login — provide API keys to skip',
      };
    }

    // OpenRouter OAuth browser flow in progress (onboarding.py:311)
    if (/please open this url in your browser to connect aider with openrouter/i.test(stripped) ||
        /waiting up to 5 minutes for you to finish in the browser/i.test(stripped)) {
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
   * Source: io.py, onboarding.py, base_coder.py, report.py
   */
  detectBlockingPrompt(output: string): BlockingPromptDetection {
    const stripped = this.stripAnsi(output);

    // First check for login / auth
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

    // Model selection
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
        instructions: 'Aider received an invalid response to a confirmation prompt',
      };
    }

    // Destructive operations — NOT auto-responded
    if (/delete|remove|overwrite/i.test(stripped) &&
        (/\[y\/n\]/i.test(stripped) || /\(Y\)es\/\(N\)o/i.test(stripped))) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'Destructive operation confirmation',
        options: ['y', 'n'],
        canAutoRespond: false,
        instructions: 'Aider is asking to perform a potentially destructive operation',
      };
    }

    // Fall back to base class detection
    return super.detectBlockingPrompt(output);
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);

    // Guard: if output contains an auth/OAuth prompt, we're NOT ready
    if (/login to openrouter/i.test(stripped) ||
        /open this url in your browser/i.test(stripped) ||
        /waiting up to 5 minutes/i.test(stripped)) {
      return false;
    }

    // Edit-format mode prompts (io.py:545): ask>, code>, architect>, help>, multi>
    if (/(?:ask|code|architect|help)(?:\s+multi)?>\s*$/m.test(stripped) ||
        /^multi>\s*$/m.test(stripped)) {
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
    content = content.replace(/^(Added|Removed|Created|Updated) .+ (to|from) the chat\.?$/gm, '');

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
  override detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    const stripped = this.stripAnsi(output);

    // Ctrl+C exit (base_coder.py:994-998)
    if (/\^C again to exit/i.test(stripped) ||
        /\^C KeyboardInterrupt/i.test(stripped)) {
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
