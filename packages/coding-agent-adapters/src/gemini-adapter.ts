/**
 * Google Gemini CLI Adapter
 *
 * Adapter for the Google Gemini CLI tool.
 */

import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from 'pty-manager';
import { BaseCodingAdapter, type InstallationInfo, type ModelRecommendations, type AgentCredentials, type AgentFileDescriptor } from './base-coding-adapter';

export class GeminiAdapter extends BaseCodingAdapter {
  readonly adapterType = 'gemini';
  readonly displayName = 'Google Gemini';

  readonly installation: InstallationInfo = {
    command: 'npm install -g @anthropics/gemini-cli',
    alternatives: [
      'See documentation for latest installation method',
    ],
    docsUrl: 'https://github.com/anthropics/gemini-cli#installation',
  };

  /**
   * Auto-response rules for Gemini CLI.
   * Gemini uses Ink/React TUI with arrow-key radio menus.
   * Source: FolderTrustDialog.tsx, MultiFolderTrustDialog.tsx, CloudFreePrivacyNotice.tsx
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    {
      pattern: /do.?you.?trust.?this.?folder|trust.?folder|trust.?parent.?folder/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Trust current folder (default selection in radio menu)',
      safe: true,
      once: true,
    },
    {
      pattern: /trust.?the.?following.?folders.*(added|workspace)/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Trust multiple folders being added to workspace',
      safe: true,
      once: true,
    },
    {
      pattern: /allow.?google.?to.?use.?this.?data/i,
      type: 'config',
      response: '',
      responseType: 'keys',
      keys: ['down', 'enter'],
      description: 'Decline Google data collection (select "No")',
      safe: true,
      once: true,
    },
  ];

  getWorkspaceFiles(): AgentFileDescriptor[] {
    return [
      {
        relativePath: 'GEMINI.md',
        description: 'Project-level instructions read automatically on startup',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: '.gemini/settings.json',
        description: 'Project-scoped settings (tool permissions, sandbox config)',
        autoLoaded: true,
        type: 'config',
        format: 'json',
      },
      {
        relativePath: '.gemini/styles',
        description: 'Custom style/persona definitions directory',
        autoLoaded: false,
        type: 'config',
        format: 'markdown',
      },
    ];
  }

  getRecommendedModels(_credentials?: AgentCredentials): ModelRecommendations {
    return {
      powerful: 'gemini-3-pro',
      fast: 'gemini-3-flash',
    };
  }

  getCommand(): string {
    return 'gemini';
  }

  getArgs(config: SpawnConfig): string[] {
    const args: string[] = [];

    // Non-interactive mode (skip if interactive mode)
    if (!this.isInteractive(config)) {
      args.push('--non-interactive');
      // Text output for easier parsing (only in non-interactive mode)
      args.push('--output-format', 'text');

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

    // Google API key from credentials
    if (credentials.googleKey) {
      env.GOOGLE_API_KEY = credentials.googleKey;
      env.GEMINI_API_KEY = credentials.googleKey;
    }

    // Model selection from config env
    if (config.env?.GEMINI_MODEL) {
      env.GEMINI_MODEL = config.env.GEMINI_MODEL;
    }

    // Disable color for parsing (skip if interactive mode)
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
      stripped.includes('GOOGLE_API_KEY') ||
      stripped.includes('GEMINI_API_KEY') ||
      stripped.includes('authentication required') ||
      stripped.includes('Invalid API key') ||
      stripped.includes('API key is not valid')
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions: 'Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable',
      };
    }

    // Gemini API key entry dialog (ApiAuthDialog.tsx)
    if (/enter.?gemini.?api.?key/i.test(stripped)) {
      return {
        required: true,
        type: 'api_key',
        instructions: 'Enter a Gemini API key or set GEMINI_API_KEY environment variable',
      };
    }

    // Auth dialog — initial auth choice (AuthDialog.tsx)
    if (/how.?would.?you.?like.?to.?authenticate/i.test(stripped) ||
        (/get.?started/i.test(stripped) && /login.?with.?google|use.?gemini.?api.?key|vertex/i.test(stripped))) {
      return {
        required: true,
        type: 'oauth',
        instructions: 'Gemini CLI authentication required — select an auth method',
      };
    }

    // OAuth in-progress (AuthInProgress.tsx)
    if (/waiting.?for.?auth/i.test(stripped)) {
      return {
        required: true,
        type: 'oauth',
        instructions: 'Waiting for browser authentication to complete',
      };
    }

    // Check for OAuth flow
    if (
      stripped.includes('Sign in with Google') ||
      stripped.includes('OAuth') ||
      stripped.includes('accounts.google.com')
    ) {
      const urlMatch = stripped.match(/https?:\/\/[^\s]+/);
      return {
        required: true,
        type: 'oauth',
        url: urlMatch ? urlMatch[0] : 'https://accounts.google.com',
        instructions: 'Google OAuth authentication required',
      };
    }

    // Check for ADC (Application Default Credentials)
    if (
      stripped.includes('Application Default Credentials') ||
      stripped.includes('gcloud auth')
    ) {
      return {
        required: true,
        type: 'browser',
        instructions: 'Run: gcloud auth application-default login',
      };
    }

    return { required: false };
  }

  detectBlockingPrompt(output: string): BlockingPromptDetection {
    const stripped = this.stripAnsi(output);

    // Tool permission / execution confirmation (ToolConfirmationMessage.tsx)
    // Check BEFORE login — permission prompts contain "API key" banner text
    // that would otherwise false-positive the login detector.
    // TUI arrow-key menu — use keys:enter to select "Allow once" (default)
    if (/apply.?this.?change\??/i.test(stripped) ||
        /allow.?execution.?of/i.test(stripped) ||
        /do.?you.?want.?to.?proceed\??/i.test(stripped) ||
        /waiting.?for.?user.?confirmation/i.test(stripped)) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'Gemini tool execution confirmation',
        suggestedResponse: 'keys:enter',
        canAutoRespond: true,
        instructions: 'Gemini is asking to apply a change (file write, shell command, etc.)',
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

    // Account validation required (ValidationDialog.tsx)
    if (/further.?action.?is.?required/i.test(stripped) ||
        /verify.?your.?account/i.test(stripped) ||
        /waiting.?for.?verification/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Account verification required',
        canAutoRespond: false,
        instructions: 'Your Gemini account requires verification before continuing',
      };
    }

    // Model selection
    if (/select.*model|choose.*model|gemini-/i.test(stripped) &&
        /\d+\)/i.test(stripped)) {
      return {
        detected: true,
        type: 'model_select',
        prompt: 'Gemini model selection',
        canAutoRespond: false,
        instructions: 'Please select a model or set GEMINI_MODEL env var',
      };
    }

    // Project selection
    if (/select.*project|choose.*project|google cloud project/i.test(stripped)) {
      return {
        detected: true,
        type: 'project_select',
        prompt: 'Google Cloud project selection',
        canAutoRespond: false,
        instructions: 'Please select a Google Cloud project',
      };
    }

    // Safety filter triggered
    if (/safety.*filter|content.*blocked|unsafe.*content/i.test(stripped)) {
      return {
        detected: true,
        type: 'unknown',
        prompt: 'Safety filter triggered',
        canAutoRespond: false,
        instructions: 'Content was blocked by safety filters',
      };
    }

    // Fall back to base class detection
    return super.detectBlockingPrompt(output);
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);

    // Definitive positive indicators — always win, even if stale auth/trust
    // dialog text is still in the buffer from a TUI re-render.
    // "Type your message" is the Composer placeholder (Composer.tsx:446)
    // and is unambiguous — the CLI is ready to accept input.
    if (/type.?your.?message/i.test(stripped)) {
      return true;
    }

    // Guard: if output contains a trust or auth prompt, we're NOT ready
    // (only checked when no definitive positive indicator is present)
    if (/do.?you.?trust.?this.?folder/i.test(stripped) ||
        /how.?would.?you.?like.?to.?authenticate/i.test(stripped) ||
        /waiting.?for.?auth/i.test(stripped) ||
        /allow.?google.?to.?use.?this.?data/i.test(stripped)) {
      return false;
    }

    // InputPrompt glyph — >, !, *, (r:) (InputPrompt.tsx:1450)
    if (/^\s*[>!*]\s+/m.test(stripped) || /\(r:\)/.test(stripped)) {
      return true;
    }

    return (
      stripped.includes('How can I help') ||
      stripped.includes('What would you like') ||
      // Match "gemini> " prompt specifically, not bare ">"
      /gemini>\s*$/i.test(stripped)
    );
  }

  parseOutput(output: string): ParsedOutput | null {
    const stripped = this.stripAnsi(output);

    const isComplete = this.isResponseComplete(stripped);

    if (!isComplete) {
      return null;
    }

    const isQuestion = this.containsQuestion(stripped);

    // Extract content, removing prompts and safety warnings
    let content = this.extractContent(stripped, /^.*(?:gemini|>)\s*/gim);
    content = content.replace(/^\[Safety[^\]]*\].*$/gm, '');

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
   * Detect exit conditions specific to Gemini CLI.
   * Source: FolderTrustDialog.tsx:127, LogoutConfirmationDialog.tsx:64
   */
  override detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    const stripped = this.stripAnsi(output);

    if (/folder.?trust.?level.?must.?be.?selected.*exiting/i.test(stripped)) {
      return {
        exited: true,
        code: 1,
        error: 'Gemini CLI exited because no folder trust level was selected',
      };
    }

    if (/you are now logged out/i.test(stripped)) {
      return {
        exited: true,
        code: 0,
      };
    }

    return super.detectExit(output);
  }

  getPromptPattern(): RegExp {
    // Match "gemini> " specifically, not bare ">" which is too broad
    return /gemini>\s*$/i;
  }

  getHealthCheckCommand(): string {
    return 'gemini --version';
  }
}
