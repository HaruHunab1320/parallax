/**
 * Base CLI Adapter
 *
 * Common functionality for CLI adapters.
 */

import { spawn } from 'child_process';
import { CLIAdapter, AgentConfig, ParsedOutput, LoginDetection } from '@parallax/runtime-interface';

/**
 * Abstract base class for CLI adapters with common functionality
 */
export abstract class BaseCLIAdapter implements CLIAdapter {
  abstract readonly agentType: string;
  abstract readonly displayName: string;

  abstract getCommand(): string;
  abstract getArgs(config: AgentConfig): string[];
  abstract getEnv(config: AgentConfig): Record<string, string>;
  abstract detectLogin(output: string): LoginDetection;
  abstract detectReady(output: string): boolean;
  abstract parseOutput(output: string): ParsedOutput | null;
  abstract getPromptPattern(): RegExp;

  /**
   * Default exit detection - look for common exit patterns
   */
  detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    // Check for common exit/error patterns
    if (output.includes('Process exited with code')) {
      const match = output.match(/Process exited with code (\d+)/);
      return {
        exited: true,
        code: match ? parseInt(match[1], 10) : 1,
      };
    }

    if (output.includes('Command not found') || output.includes('command not found')) {
      return {
        exited: true,
        code: 127,
        error: 'Command not found',
      };
    }

    return { exited: false };
  }

  /**
   * Default input formatting - just return as-is with newline
   */
  formatInput(message: string): string {
    return message;
  }

  /**
   * Validate CLI installation by running --version or --help
   */
  async validateInstallation(): Promise<{ installed: boolean; version?: string; error?: string }> {
    return new Promise((resolve) => {
      const command = this.getCommand();

      try {
        const proc = spawn(command, ['--version'], {
          shell: true,
          timeout: 5000,
        });

        let output = '';

        proc.stdout?.on('data', (data) => {
          output += data.toString();
        });

        proc.stderr?.on('data', (data) => {
          output += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            // Try to extract version from output
            const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
            resolve({
              installed: true,
              version: versionMatch ? versionMatch[1] : undefined,
            });
          } else {
            resolve({
              installed: false,
              error: `Command exited with code ${code}`,
            });
          }
        });

        proc.on('error', (err) => {
          resolve({
            installed: false,
            error: err.message,
          });
        });
      } catch (err) {
        resolve({
          installed: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Helper to check if output contains a question
   */
  protected containsQuestion(output: string): boolean {
    const questionPatterns = [
      /\?$/m,                           // Ends with ?
      /would you like/i,
      /do you want/i,
      /should I/i,
      /shall I/i,
      /please (choose|select|confirm)/i,
      /\(y\/n\)/i,
      /\[y\/N\]/i,
      /\[Y\/n\]/i,
    ];

    return questionPatterns.some((pattern) => pattern.test(output));
  }

  /**
   * Helper to strip ANSI escape codes from output
   */
  protected stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  }
}
