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
import { BaseCodingAdapter, type InstallationInfo } from './base-coding-adapter';

export class AiderAdapter extends BaseCodingAdapter {
  readonly adapterType = 'aider';
  readonly displayName = 'Aider';

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
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    {
      pattern: /Add .+ to the chat\?.*\[y\/n\]/i,
      type: 'permission',
      response: 'y',
      description: 'Allow Aider to add files to chat context',
      safe: true,
    },
    {
      pattern: /Create new file.*\[y\/n\]/i,
      type: 'permission',
      response: 'y',
      description: 'Allow Aider to create new files',
      safe: true,
    },
    {
      pattern: /Apply.*changes.*\[y\/n\]/i,
      type: 'permission',
      response: 'y',
      description: 'Apply proposed changes',
      safe: true,
    },
  ];

  getCommand(): string {
    return 'aider';
  }

  getArgs(config: SpawnConfig): string[] {
    const args: string[] = [];

    // Use auto-commits to avoid manual git operations
    args.push('--auto-commits');

    // Disable pretty output for easier parsing
    args.push('--no-pretty');

    // Don't show diffs (we'll handle this separately if needed)
    args.push('--no-show-diffs');

    // Set working directory via --file flag prefix
    // Aider uses current directory, so we rely on PTY cwd

    // Model can be specified via env or config
    const credentials = this.getCredentials(config);
    if (config.env?.AIDER_MODEL) {
      args.push('--model', config.env.AIDER_MODEL);
    }

    // Default to Claude if anthropic key is available
    if (credentials.anthropicKey && !config.env?.AIDER_MODEL) {
      args.push('--model', 'claude-3-5-sonnet-20241022');
    }

    return args;
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    const env: Record<string, string> = {};
    const credentials = this.getCredentials(config);

    // Aider supports multiple backends
    if (credentials.anthropicKey) {
      env.ANTHROPIC_API_KEY = credentials.anthropicKey;
    }

    if (credentials.openaiKey) {
      env.OPENAI_API_KEY = credentials.openaiKey;
    }

    if (credentials.googleKey) {
      env.GOOGLE_API_KEY = credentials.googleKey;
    }

    // Disable color for parsing
    env.NO_COLOR = '1';

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
        canAutoRespond: false,
        instructions: loginDetection.instructions,
      };
    }

    // Aider-specific: Model selection
    if (/select.*model|choose.*model|which model/i.test(stripped)) {
      return {
        detected: true,
        type: 'model_select',
        prompt: 'Model selection required',
        canAutoRespond: false,
        instructions: 'Please select a model or set AIDER_MODEL env var',
      };
    }

    // Aider-specific: Git repo not found
    if (/not.*git.*repo|git.*not.*found|initialize.*git/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Git repository required',
        canAutoRespond: false,
        instructions: 'Aider requires a git repository. Run git init or use --no-git',
      };
    }

    // Aider-specific: Confirm file operations (that aren't auto-responded)
    if (/delete|remove|overwrite/i.test(stripped) && /\[y\/n\]/i.test(stripped)) {
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

    return (
      stripped.includes('aider>') ||
      stripped.includes('Aider') ||
      /aider.*ready/i.test(stripped) ||
      // Aider shows file list when ready
      /Added.*to the chat/i.test(stripped) ||
      // Or the prompt
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

  getPromptPattern(): RegExp {
    return /(?:aider>|>)\s*$/i;
  }

  getHealthCheckCommand(): string {
    return 'aider --version';
  }
}
