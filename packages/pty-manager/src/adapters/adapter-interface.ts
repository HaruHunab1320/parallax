/**
 * CLI Adapter Interface
 *
 * Defines how to interact with different CLI tools via PTY.
 */

import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
} from '../types';

/**
 * Interface that CLI adapters must implement
 */
export interface CLIAdapter {
  /** Adapter type identifier */
  readonly adapterType: string;

  /** Display name for the CLI */
  readonly displayName: string;

  /**
   * Auto-response rules for handling known blocking prompts.
   * These are applied automatically during startup and execution.
   */
  readonly autoResponseRules?: AutoResponseRule[];

  /**
   * Whether this CLI uses TUI menus that require arrow-key navigation.
   * When true, auto-response rules without an explicit responseType
   * default to sending Enter via sendKeys instead of writeRaw.
   */
  readonly usesTuiMenus?: boolean;

  /**
   * Get the CLI command to execute
   */
  getCommand(): string;

  /**
   * Get command arguments
   */
  getArgs(config: SpawnConfig): string[];

  /**
   * Get environment variables needed
   */
  getEnv(config: SpawnConfig): Record<string, string>;

  /**
   * Detect if output indicates login is required
   * @deprecated Use detectBlockingPrompt() instead for comprehensive detection
   */
  detectLogin(output: string): LoginDetection;

  /**
   * Detect any blocking prompt that requires user input or auto-response.
   */
  detectBlockingPrompt?(output: string): BlockingPromptDetection;

  /**
   * Detect if CLI is ready to receive input
   */
  detectReady(output: string): boolean;

  /**
   * Detect if CLI has exited or crashed
   */
  detectExit(output: string): { exited: boolean; code?: number; error?: string };

  /**
   * Parse structured response from output buffer
   * Returns null if output is incomplete
   */
  parseOutput(output: string): ParsedOutput | null;

  /**
   * Format a message/task for this CLI
   */
  formatInput(message: string): string;

  /**
   * Get prompt pattern to detect when CLI is waiting for input
   */
  getPromptPattern(): RegExp;

  /**
   * Optional: Detect if the CLI has completed a task and returned to its idle prompt.
   * More specific than detectReady — matches high-confidence completion indicators
   * (e.g. duration summaries, explicit "done" messages) alongside the idle prompt.
   *
   * Used as a fast-path in stall detection to avoid expensive LLM classifier calls.
   * If not implemented, the stall classifier is used as the fallback.
   */
  detectTaskComplete?(output: string): boolean;

  /**
   * Optional: Validate that the CLI is installed and accessible
   */
  validateInstallation?(): Promise<{ installed: boolean; version?: string; error?: string }>;

  /**
   * Optional: Get health check command
   */
  getHealthCheckCommand?(): string;
}
