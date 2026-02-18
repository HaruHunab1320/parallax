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
import { BaseCodingAdapter, type InstallationInfo, type ModelRecommendations, type AgentCredentials } from './base-coding-adapter';

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
   * Aider uses plain text [y/n] prompts, NOT TUI menus.
   * Explicit responseType: 'text' prevents the usesTuiMenus default from kicking in.
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    {
      pattern: /Add .+ to the chat\?.*\[y\/n\]/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Allow Aider to add files to chat context',
      safe: true,
    },
    {
      pattern: /Create new file.*\[y\/n\]/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Allow Aider to create new files',
      safe: true,
    },
    {
      pattern: /Apply.*changes.*\[y\/n\]/i,
      type: 'permission',
      response: 'y',
      responseType: 'text',
      description: 'Apply proposed changes',
      safe: true,
    },
  ];

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

    // Model: explicit > provider default alias > let aider pick
    // Aliases (sonnet, 4o, gemini) are maintained by Aider and auto-update
    const provider = (config.adapterConfig as { provider?: string } | undefined)?.provider;
    if (config.env?.AIDER_MODEL) {
      args.push('--model', config.env.AIDER_MODEL);
    } else if (provider === 'anthropic') {
      args.push('--model', 'sonnet');
    } else if (provider === 'openai') {
      args.push('--model', '4o');
    } else if (provider === 'google') {
      args.push('--model', 'gemini');
    }
    // No provider preference → don't force a model, aider picks based on available keys

    // API keys via --api-key flag (no env vars needed)
    const credentials = this.getCredentials(config);
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
