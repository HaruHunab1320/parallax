/**
 * CLI Adapter Interface
 *
 * Defines how to interact with different CLI agent tools.
 */

import { AgentConfig, AgentMessage, MessageType } from './types';

/**
 * Parsed output from a CLI agent
 */
export interface ParsedOutput {
  type: MessageType;
  content: string;
  isComplete: boolean;      // Whether this is a complete response
  isQuestion: boolean;      // Whether agent is asking a question
  metadata?: Record<string, unknown>;
}

/**
 * Login detection result
 */
export interface LoginDetection {
  required: boolean;
  type?: 'api_key' | 'oauth' | 'browser' | 'device_code';
  url?: string;
  instructions?: string;
}

/**
 * Types of blocking prompts that can occur during startup or execution
 */
export type BlockingPromptType =
  | 'login'          // Authentication required
  | 'update'         // Update/upgrade available
  | 'config'         // Configuration choice needed
  | 'tos'            // Terms of service acceptance
  | 'model_select'   // Model/version selection
  | 'project_select' // Project/workspace selection
  | 'permission'     // Permission request
  | 'tool_wait'      // Agent waiting on tool/shell interaction
  | 'unknown';       // Unrecognized blocking prompt

/**
 * Blocking prompt detection result
 *
 * Generalizes login detection to handle any CLI prompt that blocks execution
 * and requires user input or auto-response.
 */
export interface BlockingPromptDetection {
  /** Whether a blocking prompt was detected */
  detected: boolean;

  /** Type of blocking prompt */
  type?: BlockingPromptType;

  /** The prompt text shown to the user */
  prompt?: string;

  /** Available options/choices if detected (e.g., ['y', 'n'], ['1', '2', '3']) */
  options?: string[];

  /** Suggested auto-response (if safe to auto-respond) */
  suggestedResponse?: string;

  /** Whether it's safe to auto-respond without user confirmation */
  canAutoRespond?: boolean;

  /** Instructions for the user if manual intervention needed */
  instructions?: string;

  /** URL to open if browser action needed */
  url?: string;
}

/**
 * Auto-response rule for handling known blocking prompts
 */
export interface AutoResponseRule {
  /** Pattern to match in output */
  pattern: RegExp;

  /** Type of prompt this handles */
  type: BlockingPromptType;

  /** Response to send automatically */
  response: string;

  /** Human-readable description of what this does */
  description: string;

  /** Whether this is safe to auto-respond (default: true) */
  safe?: boolean;
}

/**
 * Interface that CLI adapters must implement
 */
export interface CLIAdapter {
  /** Agent type this adapter handles */
  readonly agentType: string;

  /** Display name for the CLI */
  readonly displayName: string;

  /**
   * Auto-response rules for handling known blocking prompts.
   * These are applied automatically during startup and execution.
   */
  readonly autoResponseRules?: AutoResponseRule[];

  /**
   * Get the CLI command to execute
   */
  getCommand(): string;

  /**
   * Get command arguments
   */
  getArgs(config: AgentConfig): string[];

  /**
   * Get environment variables needed
   */
  getEnv(config: AgentConfig): Record<string, string>;

  /**
   * Detect if output indicates login is required
   * @deprecated Use detectBlockingPrompt() instead for comprehensive detection
   */
  detectLogin(output: string): LoginDetection;

  /**
   * Detect any blocking prompt that requires user input or auto-response.
   * This generalizes login detection to handle updates, config choices, TOS, etc.
   *
   * Implementations should check for:
   * - Login/authentication prompts
   * - Update/upgrade prompts
   * - Configuration choices (model selection, project selection)
   * - Terms of service acceptance
   * - Permission requests
   * - Any other prompt that blocks execution
   */
  detectBlockingPrompt?(output: string): BlockingPromptDetection;

  /**
   * Detect if agent is ready to receive tasks
   */
  detectReady(output: string): boolean;

  /**
   * Detect if agent has exited or crashed
   */
  detectExit(output: string): { exited: boolean; code?: number; error?: string };

  /**
   * Parse structured response from output buffer
   * Returns null if output is incomplete
   */
  parseOutput(output: string): ParsedOutput | null;

  /**
   * Format a message/task for this CLI
   * Handles any escaping or formatting needed
   */
  formatInput(message: string): string;

  /**
   * Get prompt pattern to detect when agent is waiting for input
   */
  getPromptPattern(): RegExp;

  /**
   * Optional: Validate that the CLI is installed and accessible
   */
  validateInstallation?(): Promise<{ installed: boolean; version?: string; error?: string }>;

  /**
   * Optional: Get health check command
   */
  getHealthCheckCommand?(): string;
}

/**
 * Registry of available CLI adapters
 */
export class AdapterRegistry {
  private adapters: Map<string, CLIAdapter> = new Map();

  /**
   * Register an adapter
   */
  register(adapter: CLIAdapter): void {
    this.adapters.set(adapter.agentType, adapter);
  }

  /**
   * Get adapter for agent type
   */
  get(agentType: string): CLIAdapter | undefined {
    return this.adapters.get(agentType);
  }

  /**
   * Check if adapter exists for type
   */
  has(agentType: string): boolean {
    return this.adapters.has(agentType);
  }

  /**
   * List all registered adapter types
   */
  list(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all adapters
   */
  all(): CLIAdapter[] {
    return Array.from(this.adapters.values());
  }
}
