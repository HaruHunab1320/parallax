/**
 * Base Coding Agent Adapter
 *
 * Extends pty-manager's BaseCLIAdapter with credential handling
 * for AI coding agents.
 */

import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { BaseCLIAdapter } from 'pty-manager';
import type { SpawnConfig } from 'pty-manager';
import { generateApprovalConfig, type ApprovalPreset, type ApprovalConfig } from './approval-presets';

/**
 * Supported adapter types
 */
export type AdapterType = 'claude' | 'gemini' | 'codex' | 'aider';

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
 * Describes a file that a coding agent CLI reads from the workspace.
 * Orchestration systems use this to write instructions/config before spawning agents.
 */
export interface AgentFileDescriptor {
  /** File path relative to workspace root (e.g., "CLAUDE.md", ".aider.conf.yml") */
  relativePath: string;
  /** Human-readable description of what this file does */
  description: string;
  /** Whether the CLI reads this file automatically on startup */
  autoLoaded: boolean;
  /** File category */
  type: 'memory' | 'config' | 'rules';
  /** File format */
  format: 'markdown' | 'yaml' | 'json' | 'text';
}

/**
 * Options for writing a memory file into a workspace
 */
export interface WriteMemoryOptions {
  /** Custom file name override (default: adapter's primary memory file) */
  fileName?: string;
  /** Append to existing file instead of overwriting */
  append?: boolean;
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
    /**
     * Approval preset controlling tool permissions.
     * Translates to CLI-specific config files and flags.
     */
    approvalPreset?: ApprovalPreset;
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
   * Ms of output silence after detectReady match before emitting session_ready.
   * Allows TUI rendering (status bar, shortcuts, update notices) to complete
   * before the orchestrator sends input.
   */
  readonly readySettleMs: number = 300;

  /**
   * Installation information for this CLI tool
   */
  abstract readonly installation: InstallationInfo;

  /**
   * Workspace files this CLI reads automatically.
   * Orchestration systems use this to know where to write instructions/config
   * before spawning an agent.
   */
  abstract getWorkspaceFiles(): AgentFileDescriptor[];

  /**
   * The primary memory file for this CLI (the one it reads for project instructions).
   * Returns the relativePath of the first 'memory' type file from getWorkspaceFiles().
   */
  get memoryFilePath(): string {
    const memoryFile = this.getWorkspaceFiles().find(f => f.type === 'memory');
    if (!memoryFile) {
      throw new Error(`${this.displayName} adapter has no memory file defined`);
    }
    return memoryFile.relativePath;
  }

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
   * Override stripAnsi to handle TUI cursor movement codes, spinner/box-drawing
   * characters, bare control characters, and extra whitespace.
   *
   * TUI CLIs (Claude Code, Gemini CLI, Codex) use cursor positioning
   * sequences instead of literal spaces, and render decorative Unicode
   * characters (spinners, box-drawing). All of these must be stripped so
   * adapter detection methods (detectReady, detectTaskComplete, etc.) can
   * match visible text with their regex patterns.
   *
   * Note: ❯ and › are preserved — they are prompt indicators used by
   * detectReady / detectTaskComplete.
   */
  protected stripAnsi(str: string): string {
    // Cursor forward/back/up/down, column positioning, line movement
    let result = str.replace(/\x1b\[\d*[CDABGdEF]/g, ' ');
    // Absolute positioning: \x1b[r;cH and \x1b[r;cf
    result = result.replace(/\x1b\[\d*(?:;\d+)?[Hf]/g, ' ');
    // Erase display/line (preserve word boundaries)
    result = result.replace(/\x1b\[\d*[JK]/g, ' ');

    // Strip remaining ANSI via parent
    result = super.stripAnsi(result);

    // Strip bare control characters (CR, backspace, bell, etc.)
    // Preserves \x09 (tab) and \x0a (newline) only.
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0b-\x0d\x0e-\x1f\x7f]/g, '');

    // Normalize non-breaking space (\xa0) to regular space.
    // Claude Code TUI emits \xa0 after the ❯ prompt.
    result = result.replace(/\xa0/g, ' ');

    // Strip TUI box-drawing, spinner, and decorative Unicode characters.
    // Keeps ❯ and › (prompt indicators) and ◇ (Gemini ready signal).
    result = result.replace(/[│╭╰╮╯─═╌║╔╗╚╝╠╣╦╩╬┌┐└┘├┤┬┴┼●○❮▶◀⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷✻✶✳✢⏺←→↑↓⬆⬇◆▪▫■□▲△▼▽◈⟨⟩⌘⏎⏏⌫⌦⇧⇪⌥]/g, ' ');

    // Collapse multiple spaces
    result = result.replace(/ {2,}/g, ' ');

    return result;
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading / Active-Work Detection
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Detect if the CLI is actively loading/processing (thinking spinner,
   * file reading, model streaming, etc.). When true, stall detection is
   * suppressed because the agent is provably working.
   */
  abstract detectLoading(output: string): boolean;

  // ─────────────────────────────────────────────────────────────────────────────
  // Task Completion Detection
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Detect if the CLI has completed a task and returned to its idle prompt.
   * More specific than detectReady() — matches high-confidence completion indicators
   * (e.g. duration summaries, explicit "done" messages) alongside the idle prompt.
   *
   * Used as a fast-path in stall detection to avoid expensive LLM classifier calls.
   */
  abstract detectTaskComplete(output: string): boolean;

  // ─────────────────────────────────────────────────────────────────────────────
  // Approval Presets
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Extract the approval preset from a spawn config, if set.
   */
  protected getApprovalPreset(config: SpawnConfig): ApprovalPreset | undefined {
    const adapterConfig = config.adapterConfig as { approvalPreset?: ApprovalPreset } | undefined;
    return adapterConfig?.approvalPreset;
  }

  /**
   * Generate the approval config for this adapter, if a preset is set.
   */
  getApprovalConfig(config: SpawnConfig): ApprovalConfig | null {
    const preset = this.getApprovalPreset(config);
    if (!preset) return null;
    return generateApprovalConfig(this.adapterType as 'claude' | 'gemini' | 'codex' | 'aider', preset);
  }

  /**
   * Write approval config files to a workspace directory.
   * Returns the list of files written (absolute paths).
   */
  async writeApprovalConfig(workspacePath: string, config: SpawnConfig): Promise<string[]> {
    const approvalConfig = this.getApprovalConfig(config);
    if (!approvalConfig) return [];

    const written: string[] = [];
    for (const file of approvalConfig.workspaceFiles) {
      const fullPath = join(workspacePath, file.relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, 'utf-8');
      written.push(fullPath);
    }
    return written;
  }

  /**
   * Write content to this agent's memory file in a workspace.
   * Creates parent directories as needed.
   *
   * @param workspacePath - Absolute path to the workspace root
   * @param content - The memory/instructions content to write
   * @param options - Optional: custom fileName, append mode
   * @returns The absolute path of the written file
   */
  async writeMemoryFile(
    workspacePath: string,
    content: string,
    options?: WriteMemoryOptions,
  ): Promise<string> {
    const relativePath = options?.fileName ?? this.memoryFilePath;
    const fullPath = join(workspacePath, relativePath);

    // Ensure parent directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    if (options?.append) {
      await appendFile(fullPath, content, 'utf-8');
    } else {
      await writeFile(fullPath, content, 'utf-8');
    }

    return fullPath;
  }
}
