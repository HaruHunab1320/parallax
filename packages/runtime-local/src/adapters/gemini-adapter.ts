/**
 * Google Gemini CLI Adapter
 *
 * Adapter for the Google Gemini CLI tool.
 */

import { AgentConfig, ParsedOutput, LoginDetection } from '@parallax/runtime-interface';
import { BaseCLIAdapter } from './base-adapter';

export class GeminiAdapter extends BaseCLIAdapter {
  readonly agentType = 'gemini';
  readonly displayName = 'Google Gemini';

  getCommand(): string {
    // Gemini CLI command
    return 'gemini';
  }

  getArgs(config: AgentConfig): string[] {
    const args: string[] = [];

    // Non-interactive mode
    args.push('--non-interactive');

    // Set working directory if specified
    if (config.workdir) {
      args.push('--cwd', config.workdir);
    }

    // JSON output for easier parsing
    args.push('--output-format', 'text');

    return args;
  }

  getEnv(config: AgentConfig): Record<string, string> {
    const env: Record<string, string> = {};

    // Google API key
    if (config.credentials?.googleKey) {
      env.GOOGLE_API_KEY = config.credentials.googleKey;
      env.GEMINI_API_KEY = config.credentials.googleKey;
    }

    // Model selection
    if (config.env?.GEMINI_MODEL) {
      env.GEMINI_MODEL = config.env.GEMINI_MODEL;
    }

    // Disable color for parsing
    env.NO_COLOR = '1';

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

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);

    return (
      stripped.includes('Gemini') ||
      stripped.includes('Ready') ||
      stripped.includes('How can I help') ||
      stripped.includes('What would you like') ||
      /(?:gemini|>)\s*$/i.test(stripped)
    );
  }

  parseOutput(output: string): ParsedOutput | null {
    const stripped = this.stripAnsi(output);

    const isComplete = this.isResponseComplete(stripped);

    if (!isComplete) {
      return null;
    }

    const isQuestion = this.containsQuestion(stripped);
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
    return /(?:gemini|>)\s*$/i;
  }

  /**
   * Check if response appears complete
   */
  private isResponseComplete(output: string): boolean {
    const completionIndicators = [
      /\n(?:gemini|>)\s*$/i,
      /\n\s*$/,
      /Done\./i,
      /completed/i,
      /finished/i,
      /```\s*$/,  // Code block ended
    ];

    return completionIndicators.some((pattern) => pattern.test(output));
  }

  /**
   * Extract content from Gemini output
   */
  private extractContent(output: string): string {
    let content = output;

    // Remove prompt lines
    content = content.replace(/^.*(?:gemini|>)\s*/gim, '');

    // Remove status indicators
    content = content.replace(/^(Processing|Generating|Thinking)\.+$/gm, '');

    // Remove safety warnings (but log them)
    content = content.replace(/^\[Safety[^\]]*\].*$/gm, '');

    return content.trim();
  }

  formatInput(message: string): string {
    return message;
  }

  getHealthCheckCommand(): string {
    return 'gemini --version';
  }
}
