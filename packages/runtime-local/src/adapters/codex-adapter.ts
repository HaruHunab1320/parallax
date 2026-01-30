/**
 * OpenAI Codex CLI Adapter
 *
 * Adapter for the OpenAI Codex CLI tool.
 * Note: This refers to OpenAI's CLI tools for code generation.
 */

import {
  AgentConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from '@parallax/runtime-interface';
import { BaseCLIAdapter } from './base-adapter';

export class CodexAdapter extends BaseCLIAdapter {
  readonly agentType = 'codex';
  readonly displayName = 'OpenAI Codex';

  /**
   * Auto-response rules for OpenAI Codex CLI.
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    {
      pattern: /update available.*\[y\/n\]/i,
      type: 'update',
      response: 'n',
      description: 'Decline Codex update to continue execution',
      safe: true,
    },
    {
      pattern: /new version.*\[y\/n\]/i,
      type: 'update',
      response: 'n',
      description: 'Decline version upgrade',
      safe: true,
    },
    {
      pattern: /send.*telemetry.*\[y\/n\]/i,
      type: 'config',
      response: 'n',
      description: 'Decline telemetry',
      safe: true,
    },
    {
      pattern: /enable.*beta.*features.*\[y\/n\]/i,
      type: 'config',
      response: 'n',
      description: 'Decline beta features',
      safe: true,
    },
  ];

  getCommand(): string {
    // OpenAI's CLI command
    return 'codex';
  }

  getArgs(config: AgentConfig): string[] {
    const args: string[] = [];

    // Quiet mode for less verbose output
    args.push('--quiet');

    // Set working directory if specified
    if (config.workdir) {
      args.push('--cwd', config.workdir);
    }

    return args;
  }

  getEnv(config: AgentConfig): Record<string, string> {
    const env: Record<string, string> = {};

    // OpenAI API key
    if (config.credentials?.openaiKey) {
      env.OPENAI_API_KEY = config.credentials.openaiKey;
    }

    // Model selection
    if (config.env?.OPENAI_MODEL) {
      env.OPENAI_MODEL = config.env.OPENAI_MODEL;
    }

    // Disable color output for easier parsing
    env.NO_COLOR = '1';

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
        instructions: 'Set OPENAI_API_KEY environment variable or provide credentials in agent config',
      };
    }

    // Check for device code flow
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
   * Detect blocking prompts specific to OpenAI Codex CLI
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

    // OpenAI-specific: Model selection
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

    // OpenAI-specific: Organization selection
    if (/select.*organization|choose.*org|multiple organizations/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Organization selection',
        canAutoRespond: false,
        instructions: 'Please select an OpenAI organization',
      };
    }

    // OpenAI-specific: Rate limit warning
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

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);

    return (
      stripped.includes('Codex') ||
      stripped.includes('Ready') ||
      stripped.includes('How can I help') ||
      // Check for typical prompt
      /(?:codex|>)\s*$/i.test(stripped)
    );
  }

  parseOutput(output: string): ParsedOutput | null {
    const stripped = this.stripAnsi(output);

    // Check if response is complete
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
    return /(?:codex|>)\s*$/i;
  }

  /**
   * Check if response appears complete
   */
  private isResponseComplete(output: string): boolean {
    const completionIndicators = [
      /\n(?:codex|>)\s*$/i,
      /\n\s*$/,
      /Done\./i,
      /completed/i,
      /finished/i,
    ];

    return completionIndicators.some((pattern) => pattern.test(output));
  }

  /**
   * Extract content from Codex output
   */
  private extractContent(output: string): string {
    let content = output;

    // Remove prompt lines
    content = content.replace(/^.*(?:codex|>)\s*/gim, '');

    // Remove status indicators
    content = content.replace(/^(Processing|Generating|Thinking)\.+$/gm, '');

    return content.trim();
  }

  formatInput(message: string): string {
    return message;
  }

  getHealthCheckCommand(): string {
    return 'codex --version';
  }
}
