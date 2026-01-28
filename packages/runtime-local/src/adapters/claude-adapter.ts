/**
 * Claude Code CLI Adapter
 *
 * Adapter for the Claude Code CLI (claude command).
 */

import { AgentConfig, ParsedOutput, LoginDetection } from '@parallax/runtime-interface';
import { BaseCLIAdapter } from './base-adapter';

export class ClaudeAdapter extends BaseCLIAdapter {
  readonly agentType = 'claude';
  readonly displayName = 'Claude Code';

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
