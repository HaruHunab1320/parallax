/**
 * Adapter Factory
 *
 * Factory function for creating CLI adapters from configuration.
 */

import type { CLIAdapter } from './adapter-interface.js';
import { BaseCLIAdapter } from './base-adapter.js';
import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
  AdapterFactoryConfig,
} from './types.js';

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

  constructor(private adapterConfig: AdapterFactoryConfig) {
    super();
    this.adapterType = adapterConfig.command.replace(/[^a-zA-Z0-9]/g, '-');
    this.displayName = adapterConfig.command;
    this.autoResponseRules = this.buildAutoResponseRules();
  }

  private buildAutoResponseRules(): AutoResponseRule[] {
    if (!this.adapterConfig.blockingPrompts) {
      return [];
    }

    return this.adapterConfig.blockingPrompts
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
    return this.adapterConfig.command;
  }

  getArgs(config: SpawnConfig): string[] {
    if (typeof this.adapterConfig.args === 'function') {
      return this.adapterConfig.args(config);
    }
    return this.adapterConfig.args || [];
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    if (typeof this.adapterConfig.env === 'function') {
      return this.adapterConfig.env(config);
    }
    return this.adapterConfig.env || {};
  }

  detectLogin(output: string): LoginDetection {
    if (!this.adapterConfig.loginDetection) {
      return { required: false };
    }

    const { patterns, extractUrl, extractInstructions } = this.adapterConfig.loginDetection;
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
    if (this.adapterConfig.blockingPrompts) {
      const stripped = this.stripAnsi(output);

      for (const prompt of this.adapterConfig.blockingPrompts) {
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
    if (!this.adapterConfig.readyIndicators || this.adapterConfig.readyIndicators.length === 0) {
      // Default: ready after any output
      return output.length > 10;
    }

    const stripped = this.stripAnsi(output);
    return this.adapterConfig.readyIndicators.some((pattern) => pattern.test(stripped));
  }

  detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    if (this.adapterConfig.exitIndicators) {
      for (const indicator of this.adapterConfig.exitIndicators) {
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
    if (this.adapterConfig.parseOutput) {
      return this.adapterConfig.parseOutput(output);
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
    if (this.adapterConfig.formatInput) {
      return this.adapterConfig.formatInput(message);
    }
    return message;
  }

  getPromptPattern(): RegExp {
    return this.adapterConfig.promptPattern || /[\$#>]\s*$/m;
  }
}
