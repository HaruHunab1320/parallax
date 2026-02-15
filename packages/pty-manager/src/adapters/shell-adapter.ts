/**
 * Shell Adapter
 *
 * Built-in adapter for bash/zsh shell sessions.
 */

import type { CLIAdapter } from './adapter-interface';
import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from '../types';

/**
 * Options for the shell adapter
 */
export interface ShellAdapterOptions {
  /** Shell to use (default: $SHELL or /bin/bash) */
  shell?: string;

  /** Custom prompt string (default: 'pty> ') */
  prompt?: string;
}

/**
 * Built-in adapter for shell sessions (bash/zsh)
 */
export class ShellAdapter implements CLIAdapter {
  readonly adapterType = 'shell';
  readonly displayName = 'Shell';
  readonly autoResponseRules: AutoResponseRule[] = [];

  private shell: string;
  private promptStr: string;

  constructor(options: ShellAdapterOptions = {}) {
    this.shell = options.shell || process.env.SHELL || '/bin/bash';
    this.promptStr = options.prompt || 'pty> ';
  }

  getCommand(): string {
    return this.shell;
  }

  getArgs(_config: SpawnConfig): string[] {
    return [];
  }

  getEnv(_config: SpawnConfig): Record<string, string> {
    return {
      PS1: this.promptStr,
    };
  }

  detectLogin(_output: string): LoginDetection {
    // Shell doesn't need login
    return { required: false };
  }

  detectBlockingPrompt(_output: string): BlockingPromptDetection {
    // Shell typically doesn't have blocking prompts
    return { detected: false };
  }

  detectReady(output: string): boolean {
    // Ready when we see the prompt or any meaningful output
    return output.includes(this.promptStr) || output.includes('$') || output.length > 10;
  }

  detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    if (output.includes('exit')) {
      return { exited: true, code: 0 };
    }
    return { exited: false };
  }

  parseOutput(output: string): ParsedOutput | null {
    const cleaned = this.stripAnsi(output).trim();
    if (!cleaned) return null;

    return {
      type: 'response',
      content: cleaned,
      isComplete: true,
      isQuestion: false,
    };
  }

  formatInput(message: string): string {
    return message;
  }

  getPromptPattern(): RegExp {
    // Match our custom prompt or standard shell prompts
    const escaped = this.promptStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:${escaped}|\\$|#|>)\\s*$`, 'm');
  }

  async validateInstallation(): Promise<{ installed: boolean; version?: string; error?: string }> {
    // Shell is always installed
    return { installed: true };
  }

  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  }
}
