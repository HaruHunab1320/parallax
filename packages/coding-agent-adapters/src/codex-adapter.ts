/**
 * OpenAI Codex CLI Adapter
 *
 * Adapter for the OpenAI Codex CLI tool.
 */

import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from 'pty-manager';
import { BaseCodingAdapter, type InstallationInfo, type ModelRecommendations, type AgentCredentials, type AgentFileDescriptor } from './base-coding-adapter';

export class CodexAdapter extends BaseCodingAdapter {
  readonly adapterType = 'codex';
  readonly displayName = 'OpenAI Codex';

  readonly installation: InstallationInfo = {
    command: 'npm install -g @openai/codex',
    alternatives: [
      'pip install openai (Python SDK)',
    ],
    docsUrl: 'https://github.com/openai/codex',
  };

  /**
   * Auto-response rules for OpenAI Codex CLI.
   * Codex uses ratatui/crossterm full-screen TUI with arrow-key menus.
   * Source: trust_directory.rs, update_prompt.rs, model_migration.rs, cwd_prompt.rs, chatwidget.rs, main.rs
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    {
      pattern: /update.?available.*->|update.?now|skip.?until.?next.?version/i,
      type: 'config',
      response: '',
      responseType: 'keys',
      keys: ['down', 'enter'],
      description: 'Skip Codex CLI update prompt (select "Skip")',
      safe: true,
    },
    {
      pattern: /do.?you.?trust.?the.?contents|trust.?this.?directory|yes,?.?continue|prompt.?injection/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Trust directory contents (default: "Yes, continue")',
      safe: true,
      once: true,
    },
    {
      pattern: /choose.?how.?you.?d.?like.?codex.?to.?proceed|try.?new.?model|use.?existing.?model/i,
      type: 'config',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Accept model migration (default: "Try new model")',
      safe: true,
      once: true,
    },
    {
      pattern: /choose.?working.?directory.?to.?(resume|fork)/i,
      type: 'config',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Accept default working directory for session resume',
      safe: true,
    },
    {
      pattern: /enable.?full.?access\??/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Confirm full access mode (default: "Yes, continue anyway")',
      safe: true,
      once: true,
    },
    {
      pattern: /continue.?anyway\?\s*\[y\/N\]/i,
      type: 'config',
      response: 'y',
      responseType: 'text',
      description: 'Confirm dumb terminal continuation',
      safe: true,
    },
  ];

  getWorkspaceFiles(): AgentFileDescriptor[] {
    return [
      {
        relativePath: 'AGENTS.md',
        description: 'Project-level instructions read automatically on startup',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: 'codex.md',
        description: 'Additional project context file',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: '.codex/config.json',
        description: 'Project-scoped Codex configuration',
        autoLoaded: true,
        type: 'config',
        format: 'json',
      },
    ];
  }

  getRecommendedModels(_credentials?: AgentCredentials): ModelRecommendations {
    return {
      powerful: 'o3',
      fast: 'gpt-4o-mini',
    };
  }

  getCommand(): string {
    return 'codex';
  }

  getArgs(config: SpawnConfig): string[] {
    const args: string[] = [];

    // Quiet mode for less verbose output (skip if interactive mode)
    if (!this.isInteractive(config)) {
      args.push('--quiet');

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

    // OpenAI API key from credentials
    if (credentials.openaiKey) {
      env.OPENAI_API_KEY = credentials.openaiKey;
    }

    // Model selection from config env
    if (config.env?.OPENAI_MODEL) {
      env.OPENAI_MODEL = config.env.OPENAI_MODEL;
    }

    // Disable color output for easier parsing (skip if interactive mode)
    if (!this.isInteractive(config)) {
      env.NO_COLOR = '1';
    }

    return env;
  }

  detectLogin(output: string): LoginDetection {
    const stripped = this.stripAnsi(output);

    // Check for API key issues
    if (
      stripped.includes('API key not found') ||
      stripped.includes('OPENAI_API_KEY') ||
      stripped.includes('authentication required') ||
      stripped.includes('Invalid API key') ||
      stripped.includes('Unauthorized') ||
      stripped.includes('API key is invalid')
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions: 'Set OPENAI_API_KEY environment variable or provide credentials in adapterConfig',
      };
    }

    // Onboarding auth menu (auth.rs:313)
    if (/sign.?in.?with.?chatgpt/i.test(stripped) ||
        (/sign.?in.?with.?device.?code/i.test(stripped) && !/open.?this.?link/i.test(stripped)) ||
        /provide.?your.?own.?api.?key/i.test(stripped)) {
      return {
        required: true,
        type: 'oauth',
        instructions: 'Codex authentication required — select a sign-in method or provide an API key',
      };
    }

    // Device code login flow (headless_chatgpt_login.rs:140)
    if (/preparing.?device.?code.?login/i.test(stripped) ||
        /open.?this.?link.?in.?your.?browser/i.test(stripped) ||
        /enter.?this.?one-time.?code/i.test(stripped)) {
      const codeMatch = stripped.match(/code[:\s]+([A-Z0-9-]+)/i);
      const urlMatch = stripped.match(/https?:\/\/[^\s]+/);
      return {
        required: true,
        type: 'device_code',
        url: urlMatch ? urlMatch[0] : undefined,
        instructions: codeMatch
          ? `Enter code ${codeMatch[1]} at the URL`
          : 'Device code authentication in progress — complete in browser',
      };
    }

    // Legacy device code detection
    if (stripped.includes('device code') || stripped.includes('Enter the code')) {
      const codeMatch = stripped.match(/code[:\s]+([A-Z0-9-]+)/i);
      const urlMatch = stripped.match(/https?:\/\/[^\s]+/);
      return {
        required: true,
        type: 'device_code',
        url: urlMatch ? urlMatch[0] : undefined,
        instructions: codeMatch
          ? `Enter code ${codeMatch[1]} at the URL`
          : 'Device code authentication required',
      };
    }

    return { required: false };
  }

  /**
   * Detect blocking prompts specific to OpenAI Codex CLI.
   * Source: approval_overlay.rs, chatwidget.rs, request_user_input/mod.rs
   */
  detectBlockingPrompt(output: string): BlockingPromptDetection {
    const stripped = this.stripAnsi(output);

    // Tool approval prompts (approval_overlay.rs:122)
    // Check BEFORE login — permission prompts may coexist with auth-related banner text.
    // TUI arrow-key menu — use keys:enter to select default ("Yes, proceed")
    if (/would.?you.?like.?to.?run.?the.?following.?command/i.test(stripped) ||
        /do.?you.?want.?to.?approve.?access/i.test(stripped) ||
        /would.?you.?like.?to.?make.?the.?following.?edits/i.test(stripped) ||
        (/press.?enter.?to.?confirm/i.test(stripped) && /esc.?to.?cancel/i.test(stripped))) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'Codex tool approval',
        suggestedResponse: 'keys:enter',
        canAutoRespond: true,
        instructions: 'Codex is asking permission to execute a command, approve access, or apply edits',
      };
    }

    // Login check — after permission prompts
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

    // Windows sandbox setup (chatwidget.rs:5818)
    if (/set.?up.?default.?sandbox/i.test(stripped) ||
        /use.?non-admin.?sandbox/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Windows sandbox setup',
        canAutoRespond: false,
        instructions: 'Codex needs a sandbox configuration on Windows',
      };
    }

    // Multi-step user input from model (request_user_input/mod.rs:41)
    if (/type.?your.?answer/i.test(stripped) && /select.?an.?option/i.test(stripped)) {
      return {
        detected: true,
        type: 'unknown',
        prompt: 'Codex requesting structured user input',
        canAutoRespond: false,
        instructions: 'Codex model is asking multi-step questions that require user input',
      };
    }

    // Model selection
    if (/select.*model|choose.*model|gpt-4|gpt-3\.5/i.test(stripped) &&
        /\d+\)/i.test(stripped)) {
      return {
        detected: true,
        type: 'model_select',
        prompt: 'OpenAI model selection',
        canAutoRespond: false,
        instructions: 'Please select a model or set OPENAI_MODEL env var',
      };
    }

    // Organization selection
    if (/select.*organization|choose.*org|multiple organizations/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Organization selection',
        canAutoRespond: false,
        instructions: 'Please select an OpenAI organization',
      };
    }

    // Rate limit warning
    if (/rate limit|too many requests/i.test(stripped) &&
        /retry|wait/i.test(stripped)) {
      return {
        detected: true,
        type: 'unknown',
        prompt: 'Rate limit reached',
        canAutoRespond: false,
        instructions: 'OpenAI rate limit reached - please wait',
      };
    }

    // Fall back to base class detection
    return super.detectBlockingPrompt(output);
  }

  /**
   * Detect if Codex CLI is actively loading/processing.
   *
   * Patterns from: AGENT_LOADING_STATUS_PATTERNS.json
   *   - codex_active_status_row: "• Working (0s • esc to interrupt)"
   *   - codex_active_booting_mcp: "Booting MCP server: ..."
   *   - codex_active_web_search: "Searching the web"
   */
  detectLoading(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const tail = stripped.slice(-500);

    // Active status row with "esc to interrupt"
    if (/esc\s+to\s+interrupt/i.test(tail)) {
      return true;
    }

    // Booting MCP server
    if (/Booting\s+MCP\s+server/i.test(tail)) {
      return true;
    }

    // Web search in progress
    if (/Searching\s+the\s+web/i.test(tail)) {
      return true;
    }

    return false;
  }

  /**
   * Detect task completion for Codex CLI.
   *
   * High-confidence patterns:
   *   - "Worked for Xm Ys" separator after work-heavy turns
   *   - "› Ask Codex to do anything" ready prompt
   *
   * Patterns from: AGENT_LOADING_STATUS_PATTERNS.json
   *   - codex_completed_worked_for_separator
   *   - codex_ready_prompt
   */
  detectTaskComplete(output: string): boolean {
    const stripped = this.stripAnsi(output);

    // "Worked for <duration>" separator — high-confidence completion indicator
    const hasWorkedFor = /Worked\s+for\s+\d+(?:h\s+\d{2}m\s+\d{2}s|m\s+\d{2}s|s)/.test(stripped);

    // Ready prompt: "› Ask Codex to do anything"
    const hasReadyPrompt = /›\s+Ask\s+Codex\s+to\s+do\s+anything/.test(stripped);

    // High confidence: worked-for separator + ready prompt
    if (hasWorkedFor && hasReadyPrompt) {
      return true;
    }

    // Medium confidence: ready prompt alone (strong signal post-task)
    if (hasReadyPrompt) {
      return true;
    }

    // Worked-for separator + any › prompt
    if (hasWorkedFor && /›\s+/m.test(stripped)) {
      return true;
    }

    return false;
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);

    // Guard: if output contains trust, auth, or update prompts, we're NOT ready
    if (/do.?you.?trust.?the.?contents/i.test(stripped) ||
        /sign.?in.?with.?chatgpt/i.test(stripped) ||
        /update.?available/i.test(stripped) ||
        /enable.?full.?access/i.test(stripped) ||
        /choose.?working.?directory/i.test(stripped)) {
      return false;
    }

    // Ready prompt glyph `›` with placeholder suggestions (chat_composer.rs:3697)
    if (/›\s+/m.test(stripped)) {
      return true;
    }

    // Placeholder suggestions indicate the composer is active (chatwidget.rs:7228)
    if (/explain this codebase|summarize recent commits|find and fix a bug/i.test(stripped)) {
      return true;
    }

    return (
      stripped.includes('How can I help') ||
      /(?:codex|>)\s*$/i.test(stripped)
    );
  }

  parseOutput(output: string): ParsedOutput | null {
    const stripped = this.stripAnsi(output);

    const isComplete = this.isResponseComplete(stripped);

    if (!isComplete) {
      return null;
    }

    const isQuestion = this.containsQuestion(stripped);
    const content = this.extractContent(stripped, /^.*(?:codex|>)\s*/gim);

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

  /**
   * Detect exit conditions specific to Codex CLI.
   * Source: main.rs:404, main.rs:414, main.rs:461
   */
  override detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    const stripped = this.stripAnsi(output);

    // Session ended — provides resume command (main.rs:404)
    if (/to.?continue.?this.?session,?.?run/i.test(stripped)) {
      return { exited: true, code: 0 };
    }

    // Update completed — needs restart (main.rs:461)
    if (/update.?ran.?successfully.*restart.?codex/i.test(stripped)) {
      return {
        exited: true,
        code: 0,
        error: 'Codex updated successfully — restart required',
      };
    }

    return super.detectExit(output);
  }

  getPromptPattern(): RegExp {
    return /(?:codex|>)\s*$/i;
  }

  getHealthCheckCommand(): string {
    return 'codex --version';
  }
}
