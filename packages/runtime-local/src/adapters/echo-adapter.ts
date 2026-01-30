/**
 * Echo CLI Adapter (for testing)
 *
 * A simple adapter that echoes input back, useful for testing the runtime
 * without requiring actual AI CLI tools.
 */

import {
  CLIAdapter,
  AgentConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from '@parallax/runtime-interface';

export class EchoAdapter implements CLIAdapter {
  readonly agentType = 'echo';
  readonly displayName = 'Echo (Test)';

  // No auto-response rules for echo adapter - it's for testing
  readonly autoResponseRules: AutoResponseRule[] = [];

  getCommand(): string {
    // Use bash as the underlying shell with absolute path
    return '/bin/bash';
  }

  getArgs(_config: AgentConfig): string[] {
    return [];
  }

  getEnv(_config: AgentConfig): Record<string, string> {
    return {
      PS1: 'echo> ',
    };
  }

  detectLogin(_output: string): LoginDetection {
    // Echo adapter never needs login
    return { required: false };
  }

  detectBlockingPrompt(_output: string): BlockingPromptDetection {
    // Echo adapter never has blocking prompts - it's for testing
    return { detected: false };
  }

  detectReady(output: string): boolean {
    // Ready when we see the prompt or any output after starting
    return output.includes('echo>') || output.includes('bash') || output.length > 10;
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

  getPromptPattern(): RegExp {
    // Match bash prompt or echo prompt
    return /(?:echo>|bash-\d+\.\d+\$|\$)\s*$/m;
  }

  detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    if (output.includes('exit')) {
      return { exited: true, code: 0 };
    }
    return { exited: false };
  }

  formatInput(message: string): string {
    // For echo testing, just echo the message back
    return `echo "ECHO: ${message.replace(/"/g, '\\"')}"`;
  }

  async validateInstallation(): Promise<{ installed: boolean; version?: string; error?: string }> {
    // Bash is always installed
    return { installed: true, version: 'test' };
  }

  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  }
}
