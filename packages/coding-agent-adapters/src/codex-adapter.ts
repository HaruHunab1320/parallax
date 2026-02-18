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
import { BaseCodingAdapter, type InstallationInfo } from './base-coding-adapter';

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
    return 'codex';
  }

  getArgs(config: SpawnConfig): string[] {
    const args: string[] = [];

    // Quiet mode for less verbose output (skip if interactive mode)
    if (!this.isInteractive(config)) {
      args.push('--quiet');
    }

    // Set working directory if specified
    if (config.workdir) {
      args.push('--cwd', config.workdir);
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

  getPromptPattern(): RegExp {
    return /(?:codex|>)\s*$/i;
  }

  getHealthCheckCommand(): string {
    return 'codex --version';
  }
}
