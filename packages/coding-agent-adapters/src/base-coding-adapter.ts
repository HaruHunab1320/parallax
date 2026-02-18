/**
 * Base Coding Agent Adapter
 *
 * Extends pty-manager's BaseCLIAdapter with credential handling
 * for AI coding agents.
 */

import { BaseCLIAdapter } from 'pty-manager';
import type { SpawnConfig } from 'pty-manager';

/**
 * Credentials that can be passed via SpawnConfig.adapterConfig
 */
export interface AgentCredentials {
  anthropicKey?: string;
  openaiKey?: string;
  googleKey?: string;
  githubToken?: string;
  custom?: Record<string, string>;
}

/**
 * Installation information for a CLI tool
 */
export interface InstallationInfo {
  /** Command to install the CLI (e.g., "npm install -g @anthropic-ai/claude-code") */
  command: string;
  /** Alternative installation methods */
  alternatives?: string[];
  /** URL to installation docs */
  docsUrl: string;
  /** Minimum required version (if known) */
  minVersion?: string;
}

/**
 * Model tier recommendations for an adapter
 */
export interface ModelRecommendations {
  /** Most capable model for complex tasks */
  powerful: string;
  /** Fastest/cheapest model for simple tasks */
  fast: string;
}

/**
 * Extended config with credentials and mode support
 */
export interface CodingAgentConfig extends SpawnConfig {
  adapterConfig?: AgentCredentials & {
    /**
     * Run in interactive mode (skip --print/--quiet/--non-interactive flags).
     * Use this when you want the full interactive CLI experience.
     */
    interactive?: boolean;
    /**
     * Preferred provider for multi-provider adapters (e.g., Aider).
     * Only the API key for this provider is passed, letting the CLI
     * pick its best model for that provider automatically.
     */
    provider?: 'anthropic' | 'openai' | 'google';
  } & Record<string, unknown>;
}

/**
 * Base class for AI coding agent adapters
 */
export abstract class BaseCodingAdapter extends BaseCLIAdapter {
  /**
   * Coding agent CLIs use TUI menus that require arrow-key navigation.
   */
  override readonly usesTuiMenus: boolean = true;

  /**
   * Installation information for this CLI tool
   */
  abstract readonly installation: InstallationInfo;

  /**
   * Get credentials from config
   */
  protected getCredentials(config: SpawnConfig): AgentCredentials {
    const adapterConfig = config.adapterConfig as AgentCredentials | undefined;
    return adapterConfig || {};
  }

  /**
   * Check if interactive mode is enabled.
   * When true, skip non-interactive flags (--print, --quiet, etc.)
   */
  protected isInteractive(config: SpawnConfig): boolean {
    const adapterConfig = config.adapterConfig as { interactive?: boolean } | undefined;
    return adapterConfig?.interactive === true;
  }

  /**
   * Get recommended models for this adapter.
   * Returns powerful (most capable) and fast (cheapest/fastest) model names.
   */
  abstract getRecommendedModels(credentials?: AgentCredentials): ModelRecommendations;

  /**
   * Override stripAnsi to handle TUI cursor-forward codes.
   * TUI CLIs (Claude Code, Gemini CLI) use \x1b[<n>C (cursor forward)
   * instead of literal spaces for word positioning. Replace with spaces
   * before stripping other ANSI codes so regex patterns can match.
   */
  protected stripAnsi(str: string): string {
    const withSpaces = str.replace(/\x1b\[\d*C/g, ' ');
    return super.stripAnsi(withSpaces);
  }

  /**
   * Override detectExit to include installation instructions
   */
  detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    if (output.includes('Command not found') || output.includes('command not found')) {
      return {
        exited: true,
        code: 127,
        error: `${this.displayName} CLI not found. Install with: ${this.installation.command}\nDocs: ${this.installation.docsUrl}`,
      };
    }

    return super.detectExit(output);
  }

  /**
   * Get formatted installation instructions
   */
  getInstallInstructions(): string {
    const lines = [
      `${this.displayName} Installation`,
      `${'='.repeat(this.displayName.length + 13)}`,
      '',
      `Primary: ${this.installation.command}`,
    ];

    if (this.installation.alternatives?.length) {
      lines.push('');
      lines.push('Alternatives:');
      for (const alt of this.installation.alternatives) {
        lines.push(`  - ${alt}`);
      }
    }

    lines.push('');
    lines.push(`Docs: ${this.installation.docsUrl}`);

    if (this.installation.minVersion) {
      lines.push(`Minimum version: ${this.installation.minVersion}`);
    }

    return lines.join('\n');
  }

  /**
   * Check if response appears complete based on common patterns
   */
  protected isResponseComplete(output: string): boolean {
    const completionIndicators = [
      /\n>\s*$/,           // Ends with prompt
      /\n\s*$/,            // Ends with newline
      /Done\./i,           // Explicit done
      /completed/i,        // Task completed
      /finished/i,         // Finished
      /```\s*$/,           // Code block ended
    ];

    return completionIndicators.some((pattern) => pattern.test(output));
  }

  /**
   * Extract the main content from CLI output, removing common artifacts
   */
  protected extractContent(output: string, promptPattern: RegExp): string {
    let content = output;

    // Remove prompt lines
    content = content.replace(promptPattern, '');

    // Remove common status lines
    content = content.replace(/^(Thinking|Working|Reading|Writing|Processing|Generating)\.+$/gm, '');

    // Trim whitespace
    content = content.trim();

    return content;
  }
}
