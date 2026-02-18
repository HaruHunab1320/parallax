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
} from 'pty-manager';
import { BaseCodingAdapter, type InstallationInfo, type ModelRecommendations, type AgentCredentials } from './base-coding-adapter';

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

    // First check for login
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

    // Gemini-specific: Tool execution confirmation (WriteFile, Shell, etc.)
    // TUI menu — use keys:enter to confirm
    if (/Apply this change\?/i.test(stripped) || /Waiting for user confirmation/i.test(stripped)) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'Gemini tool execution confirmation',
        suggestedResponse: 'keys:enter',
        canAutoRespond: true,
        instructions: 'Gemini is asking to apply a change (file write, shell command, etc.)',
      };
    }

    // Gemini-specific: Model selection
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

    // Gemini-specific: Project selection
    if (/select.*project|choose.*project|google cloud project/i.test(stripped)) {
      return {
        detected: true,
        type: 'project_select',
        prompt: 'Google Cloud project selection',
        canAutoRespond: false,
        instructions: 'Please select a Google Cloud project',
      };
    }

    // Gemini-specific: Safety filter triggered
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

    // Specific ready indicators - avoid broad patterns like "Gemini" which
    // appears in banners alongside auth errors
    return (
      stripped.includes('Ready') ||
      stripped.includes('Type your message') ||
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

  getPromptPattern(): RegExp {
    // Match "gemini> " specifically, not bare ">" which is too broad
    return /gemini>\s*$/i;
  }

  getHealthCheckCommand(): string {
    return 'gemini --version';
  }
}
