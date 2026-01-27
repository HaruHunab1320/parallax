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
 * Interface that CLI adapters must implement
 */
export interface CLIAdapter {
  /** Agent type this adapter handles */
  readonly agentType: string;

  /** Display name for the CLI */
  readonly displayName: string;

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
   */
  detectLogin(output: string): LoginDetection;

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
