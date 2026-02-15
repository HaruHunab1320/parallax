/**
 * Adapter Factory
 *
 * Factory function for creating CLI adapters from configuration.
 */

import type { CLIAdapter } from './adapter-interface';
import { BaseCLIAdapter } from './base-adapter';
import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
  AdapterFactoryConfig,
} from '../types';

/**
 * Creates a CLI adapter from configuration
 */
export function createAdapter(config: AdapterFactoryConfig): CLIAdapter {
  return new ConfiguredAdapter(config);
}

/**
 * Adapter implementation created from configuration
 */
class ConfiguredAdapter extends BaseCLIAdapter {
  readonly adapterType: string;
  readonly displayName: string;
  readonly autoResponseRules: AutoResponseRule[];

  constructor(private config: AdapterFactoryConfig) {
    super();
    this.adapterType = config.command.replace(/[^a-zA-Z0-9]/g, '-');
    this.displayName = config.command;
    this.autoResponseRules = this.buildAutoResponseRules();
  }

  private buildAutoResponseRules(): AutoResponseRule[] {
    if (!this.config.blockingPrompts) {
      return [];
    }

    return this.config.blockingPrompts
      .filter((p) => p.autoResponse !== undefined)
      .map((p) => ({
        pattern: p.pattern,
        type: p.type,
        response: p.autoResponse!,
        description: p.description || `Auto-respond to ${p.type} prompt`,
        safe: p.safe !== false,
      }));
  }

  getCommand(): string {
    return this.config.command;
  }

  getArgs(config: SpawnConfig): string[] {
    if (typeof this.config.args === 'function') {
      return this.config.args(config);
    }
    return this.config.args || [];
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    if (typeof this.config.env === 'function') {
      return this.config.env(config);
    }
    return this.config.env || {};
  }

  detectLogin(output: string): LoginDetection {
    if (!this.config.loginDetection) {
      return { required: false };
    }

    const { patterns, extractUrl, extractInstructions } = this.config.loginDetection;
    const stripped = this.stripAnsi(output);

    for (const pattern of patterns) {
      if (pattern.test(stripped)) {
        return {
          required: true,
          type: 'browser',
          url: extractUrl?.(stripped) || undefined,
          instructions: extractInstructions?.(stripped) || 'Authentication required',
        };
      }
    }

    return { required: false };
  }

  detectBlockingPrompt(output: string): BlockingPromptDetection {
    // First check config-defined blocking prompts
    if (this.config.blockingPrompts) {
      const stripped = this.stripAnsi(output);

      for (const prompt of this.config.blockingPrompts) {
        if (prompt.pattern.test(stripped)) {
          return {
            detected: true,
            type: prompt.type,
            prompt: stripped.slice(-200),
            suggestedResponse: prompt.autoResponse,
            canAutoRespond: prompt.autoResponse !== undefined && prompt.safe !== false,
            instructions: prompt.description,
          };
        }
      }
    }

    // Fall back to base implementation
    return super.detectBlockingPrompt(output);
  }

  detectReady(output: string): boolean {
    if (!this.config.readyIndicators || this.config.readyIndicators.length === 0) {
      // Default: ready after any output
      return output.length > 10;
    }

    const stripped = this.stripAnsi(output);
    return this.config.readyIndicators.some((pattern) => pattern.test(stripped));
  }

  detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    if (this.config.exitIndicators) {
      for (const indicator of this.config.exitIndicators) {
        const match = output.match(indicator.pattern);
        if (match) {
          const code = indicator.codeExtractor?.(match) ?? 1;
          return { exited: true, code };
        }
      }
    }

    // Fall back to base implementation
    return super.detectExit(output);
  }

  parseOutput(output: string): ParsedOutput | null {
    if (this.config.parseOutput) {
      return this.config.parseOutput(output);
    }

    // Default parsing
    const cleaned = this.stripAnsi(output).trim();
    if (!cleaned) return null;

    return {
      type: 'response',
      content: cleaned,
      isComplete: true,
      isQuestion: this.containsQuestion(cleaned),
    };
  }

  formatInput(message: string): string {
    if (this.config.formatInput) {
      return this.config.formatInput(message);
    }
    return message;
  }

  getPromptPattern(): RegExp {
    return this.config.promptPattern || /[\$#>]\s*$/m;
  }
}
