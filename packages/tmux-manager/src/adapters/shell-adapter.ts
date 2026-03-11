/**
 * Shell Adapter
 *
 * Built-in adapter for bash/zsh shell sessions.
 */

import type {
  CLIAdapter,
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from 'adapter-types';

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
    // Use -f for zsh to prevent rc files from overriding our prompt
    if (this.shell.endsWith('/zsh') || this.shell === 'zsh') {
      return ['-f'];
    }
    // Use --norc --noprofile for bash to prevent rc files from overriding our prompt
    if (this.shell.endsWith('/bash') || this.shell === 'bash') {
      return ['--norc', '--noprofile'];
    }
    return [];
  }

  getEnv(_config: SpawnConfig): Record<string, string> {
    return {
      PS1: this.promptStr,
      PROMPT: this.promptStr, // zsh uses PROMPT instead of PS1
    };
  }

  detectLogin(_output: string): LoginDetection {
    return { required: false };
  }

  detectBlockingPrompt(_output: string): BlockingPromptDetection {
    return { detected: false };
  }

  detectReady(output: string): boolean {
    if (this.isContinuationPrompt(output)) {
      return false;
    }

    return this.getPromptPattern().test(this.stripAnsi(output));
  }

  private isContinuationPrompt(output: string): boolean {
    const stripped = this.stripAnsi(output);
    return /(?:quote|dquote|heredoc|bquote|cmdsubst|pipe|then|else|do|loop)>\s*$/.test(stripped)
      || /(?:quote|dquote|heredoc|bquote)>\s*$/m.test(stripped);
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
    // Trim trailing space from prompt for matching — tmux capture-pane strips trailing whitespace
    const escaped = this.promptStr.trimEnd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:${escaped}|\\$|#)\\s*$`, 'm');
  }

  async validateInstallation(): Promise<{ installed: boolean; version?: string; error?: string }> {
    return { installed: true };
  }

  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  }
}
