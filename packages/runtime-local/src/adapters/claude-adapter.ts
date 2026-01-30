/**
 * Claude Code CLI Adapter
 *
 * Adapter for the Claude Code CLI (claude command).
 */

import {
  AgentConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from '@parallax/runtime-interface';
import { BaseCLIAdapter } from './base-adapter';

export class ClaudeAdapter extends BaseCLIAdapter {
  readonly agentType = 'claude';
  readonly displayName = 'Claude Code';

  /**
   * Auto-response rules for Claude Code CLI.
   * These handle common prompts that can be safely auto-responded.
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    {
      pattern: /update available.*\[y\/n\]/i,
      type: 'update',
      response: 'n',
      description: 'Decline Claude Code update to continue execution',
      safe: true,
    },
    {
      pattern: /new version.*available.*\[y\/n\]/i,
      type: 'update',
      response: 'n',
      description: 'Decline version upgrade prompt',
      safe: true,
    },
    {
      pattern: /would you like to enable.*telemetry.*\[y\/n\]/i,
      type: 'config',
      response: 'n',
      description: 'Decline telemetry prompt',
      safe: true,
    },
    {
      pattern: /send anonymous usage data.*\[y\/n\]/i,
      type: 'config',
      response: 'n',
      description: 'Decline anonymous usage data',
      safe: true,
    },
    {
      pattern: /continue without.*\[y\/n\]/i,
      type: 'config',
      response: 'y',
      description: 'Continue without optional feature',
      safe: true,
    },
  ];

  getCommand(): string {
    return 'claude';
  }

  getArgs(config: AgentConfig): string[] {
    const args: string[] = [];

    // Print mode for non-interactive usage
    args.push('--print');

    // Set working directory if specified
    if (config.workdir) {
      args.push('--cwd', config.workdir);
    }

    // Add any custom model settings via env instead of args
    // Claude Code uses ANTHROPIC_MODEL env var

    return args;
  }

  getEnv(config: AgentConfig): Record<string, string> {
    const env: Record<string, string> = {};

    // API key
    if (config.credentials?.anthropicKey) {
      env.ANTHROPIC_API_KEY = config.credentials.anthropicKey;
    }

    // Model selection (if specified in config)
    if (config.env?.ANTHROPIC_MODEL) {
      env.ANTHROPIC_MODEL = config.env.ANTHROPIC_MODEL;
    }

    // Disable interactive features for automation
    env.CLAUDE_CODE_DISABLE_INTERACTIVE = 'true';

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
        instructions: 'Set ANTHROPIC_API_KEY environment variable or provide credentials in agent config',
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
        suggestedResponse: 'y', // Generally safe in controlled environments
        canAutoRespond: true,
        instructions: 'Claude Code requesting file access permission',
      };
    }

    // Fall back to base class detection
    return super.detectBlockingPrompt(output);
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);

    // Claude Code shows a prompt when ready
    return (
      stripped.includes('Claude Code') ||
      stripped.includes('How can I help') ||
      stripped.includes('What would you like') ||
      // Check for the typical prompt pattern
      />\s*$/.test(stripped) ||
      // Or a clear ready indicator
      stripped.includes('Ready')
    );
  }

  parseOutput(output: string): ParsedOutput | null {
    const stripped = this.stripAnsi(output);

    // Check if this looks like a complete response
    // Claude Code typically ends responses with a newline and prompt
    const isComplete = this.isResponseComplete(stripped);

    if (!isComplete) {
      return null;
    }

    // Determine if this is a question
    const isQuestion = this.containsQuestion(stripped);

    // Extract the actual content (remove prompt artifacts)
    const content = this.extractContent(stripped);

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
    return /(?:claude|>)\s*$/i;
  }

  /**
   * Check if response appears complete
   */
  private isResponseComplete(output: string): boolean {
    // Look for indicators that Claude has finished responding
    const completionIndicators = [
      /\n>\s*$/,                    // Ends with prompt
      /\n\s*$/,                     // Ends with newline
      /Done\./i,                    // Explicit done
      /completed/i,                 // Task completed
    ];

    return completionIndicators.some((pattern) => pattern.test(output));
  }

  /**
   * Extract the main content from Claude's output
   */
  private extractContent(output: string): string {
    // Remove common prefixes/suffixes
    let content = output;

    // Remove prompt lines
    content = content.replace(/^.*>\s*/gm, '');

    // Remove status lines
    content = content.replace(/^(Thinking|Working|Reading|Writing)\.+$/gm, '');

    // Trim whitespace
    content = content.trim();

    return content;
  }

  /**
   * Format input for Claude Code
   */
  formatInput(message: string): string {
    // Claude Code accepts plain text input
    // For multi-line, we may need to handle escaping
    return message;
  }

  getHealthCheckCommand(): string {
    return 'claude --version';
  }
}
