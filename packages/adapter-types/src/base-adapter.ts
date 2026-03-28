/**
 * Base CLI Adapter
 *
 * Abstract base class with common functionality for CLI adapters.
 */

import { spawn } from 'child_process';
import type { CLIAdapter } from './adapter-interface.js';
import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from './types.js';

/**
 * Abstract base class for CLI adapters with common functionality
 */
export abstract class BaseCLIAdapter implements CLIAdapter {
  abstract readonly adapterType: string;
  abstract readonly displayName: string;

  /**
   * Auto-response rules for handling known blocking prompts.
   * Subclasses should override this to add CLI-specific rules.
   */
  readonly autoResponseRules: AutoResponseRule[] = [];

  /**
   * Whether this CLI uses TUI menus requiring arrow-key navigation.
   * Defaults to false; coding agent adapters override to true.
   */
  readonly usesTuiMenus: boolean = false;

  abstract getCommand(): string;
  abstract getArgs(config: SpawnConfig): string[];
  abstract getEnv(config: SpawnConfig): Record<string, string>;
  abstract detectLogin(output: string): LoginDetection;
  abstract detectReady(output: string): boolean;
  abstract parseOutput(output: string): ParsedOutput | null;
  abstract getPromptPattern(): RegExp;

  /**
   * Default exit detection - look for common exit patterns
   */
  detectExit(output: string): { exited: boolean; code?: number; error?: string } {
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
   * Default blocking prompt detection - looks for common prompt patterns.
   * Subclasses should override for CLI-specific detection.
   */
  detectBlockingPrompt(output: string): BlockingPromptDetection {
    let stripped = this.stripAnsi(output);

    // Strip TUI box-drawing/chrome characters so patterns work for ink/React CLIs
    stripped = stripped.replace(/[│╭╰╮╯─═╌║╔╗╚╝╠╣╦╩╬┌┐└┘├┤┬┴┼●○❯❮▶◀⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⏺←→↑↓]/g, ' ');
    stripped = stripped.replace(/ {2,}/g, ' ');

    // Check for login/auth first (highest priority)
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

    // Check for common update prompts
    if (/update (available|now|ready)/i.test(stripped) && /\[y\/n\]/i.test(stripped)) {
      return {
        detected: true,
        type: 'update',
        prompt: 'Update available',
        options: ['y', 'n'],
        suggestedResponse: 'n',
        canAutoRespond: true,
        instructions: 'CLI update available - auto-declining to continue',
      };
    }

    // Check for terms of service / license acceptance
    if (/accept.*(terms|license|agreement)/i.test(stripped) && /\[y\/n\]/i.test(stripped)) {
      return {
        detected: true,
        type: 'tos',
        prompt: 'Terms/license acceptance required',
        options: ['y', 'n'],
        canAutoRespond: false,
        instructions: 'Please accept the terms of service manually',
      };
    }

    // Check for model/version selection
    if (/choose.*model|select.*model|which model/i.test(stripped)) {
      return {
        detected: true,
        type: 'model_select',
        prompt: 'Model selection required',
        canAutoRespond: false,
        instructions: 'Please select a model',
      };
    }

    // Check for project/workspace selection
    if (/choose.*(project|workspace)|select.*(project|workspace)/i.test(stripped)) {
      return {
        detected: true,
        type: 'project_select',
        prompt: 'Project/workspace selection required',
        canAutoRespond: false,
        instructions: 'Please select a project or workspace',
      };
    }

    // Check for generic y/n prompts
    if (/\[y\/n\]|\(y\/n\)|\[Y\/n\]|\[y\/N\]|\(Y\)es\/\(N\)o|Yes\/No\??/i.test(stripped)) {
      return {
        detected: true,
        type: 'unknown',
        prompt: stripped.slice(-200),
        options: ['y', 'n'],
        canAutoRespond: false,
        instructions: 'Confirmation prompt detected',
      };
    }

    // Check for numbered menu prompts
    if (/^\s*[›>]?\s*[1-9]\.\s+\w+/m.test(stripped) && /\?\s*$/m.test(stripped)) {
      const optionMatches = stripped.match(/[›>]?\s*([1-9])\.\s+([^\n]+)/g);
      const options = optionMatches
        ? optionMatches.map((m) => m.replace(/^[›>\s]*/, '').trim())
        : [];

      return {
        detected: true,
        type: 'unknown',
        prompt: stripped.slice(-300),
        options: options.length > 0 ? options : undefined,
        canAutoRespond: false,
        instructions: 'Menu selection prompt detected',
      };
    }

    // Check for "Enter to confirm" style prompts
    if (/press enter|hit enter|enter to (confirm|continue|proceed)|press return/i.test(stripped)) {
      return {
        detected: true,
        type: 'unknown',
        prompt: stripped.slice(-200),
        suggestedResponse: '\n',
        canAutoRespond: false,
        instructions: 'Enter/confirm prompt detected',
      };
    }

    // Check for trust/permission prompts
    if (/trust|allow|permission|grant access/i.test(stripped) && /\?\s*$/m.test(stripped)) {
      return {
        detected: true,
        type: 'permission',
        prompt: stripped.slice(-200),
        canAutoRespond: false,
        instructions: 'Permission/trust prompt detected',
      };
    }

    // Fallback: any line ending with ?
    const lines = stripped.split('\n').filter((l) => l.trim());
    const lastLine = lines[lines.length - 1] || '';
    if (/\?\s*$/.test(lastLine) && lastLine.length < 200) {
      return {
        detected: true,
        type: 'unknown',
        prompt: lastLine.trim(),
        canAutoRespond: false,
        instructions: 'Question prompt detected',
      };
    }

    return { detected: false };
  }

  /**
   * Default task completion detection — delegates to detectReady().
   */
  detectTaskComplete(output: string): boolean {
    return this.detectReady(output);
  }

  /**
   * Default input formatting for TUI compatibility:
   * - Strip ANSI escape codes (colors, cursor movement)
   * - Collapse newlines to spaces (prevent premature Enter in TUI)
   */
  formatInput(message: string): string {
    // eslint-disable-next-line no-control-regex
    return message.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\\u001b\[[0-9;]*[a-zA-Z]/g, '').replace(/\n+/g, ' ').trim();
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
      /\?$/m,
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
    // Replace cursor-forward sequences with spaces before stripping
    const withSpaces = str.replace(/\x1b\[\d*C/g, ' ');
    // Strip OSC sequences
    const withoutOsc = withSpaces.replace(/\x1b\](?:[^\x07\x1b]|\x1b[^\\])*(?:\x07|\x1b\\)/g, '');
    // Strip DCS sequences
    const withoutDcs = withoutOsc.replace(/\x1bP(?:[^\x1b]|\x1b[^\\])*\x1b\\/g, '');
    // eslint-disable-next-line no-control-regex
    return withoutDcs.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  }
}
