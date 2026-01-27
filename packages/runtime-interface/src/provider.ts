/**
 * Runtime Provider Interface
 *
 * The contract that all runtime implementations must follow.
 */

import { EventEmitter } from 'node:events';
import {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentStatus,
  AgentType,
  AgentMetrics,
} from './types';

/**
 * Options for stopping an agent
 */
export interface StopOptions {
  force?: boolean;        // Force kill without graceful shutdown
  timeout?: number;       // Timeout for graceful shutdown in ms
}

/**
 * Options for sending a message to an agent
 */
export interface SendOptions {
  timeout?: number;       // Timeout waiting for response in ms
  expectResponse?: boolean; // Whether to wait for a response
}

/**
 * Options for retrieving logs
 */
export interface LogOptions {
  tail?: number;          // Number of lines from end
  follow?: boolean;       // Stream new logs
  since?: Date;           // Logs since this time
}

/**
 * Filter for listing agents
 */
export interface AgentFilter {
  status?: AgentStatus | AgentStatus[];
  role?: string;
  type?: AgentType | AgentType[];
  capabilities?: string[];
}

/**
 * Interface that all runtime providers must implement
 */
export interface RuntimeProvider {
  /** Runtime identifier */
  readonly name: string;

  /** Runtime type */
  readonly type: 'local' | 'docker' | 'kubernetes';

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────

  /**
   * Initialize the runtime (connect to Docker, K8s, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the runtime and cleanup resources
   * @param stopAgents - Whether to stop all running agents (default: true)
   */
  shutdown(stopAgents?: boolean): Promise<void>;

  /**
   * Check if runtime is healthy and operational
   */
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  // ─────────────────────────────────────────────────────────────
  // Agent Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Spawn a new agent
   */
  spawn(config: AgentConfig): Promise<AgentHandle>;

  /**
   * Stop an agent
   */
  stop(agentId: string, options?: StopOptions): Promise<void>;

  /**
   * Restart an agent
   */
  restart(agentId: string): Promise<AgentHandle>;

  /**
   * Get agent by ID
   */
  get(agentId: string): Promise<AgentHandle | null>;

  /**
   * List agents managed by this runtime
   */
  list(filter?: AgentFilter): Promise<AgentHandle[]>;

  // ─────────────────────────────────────────────────────────────
  // Communication
  // ─────────────────────────────────────────────────────────────

  /**
   * Send a message/task to an agent
   */
  send(agentId: string, message: string, options?: SendOptions): Promise<AgentMessage | void>;

  /**
   * Subscribe to messages from an agent
   */
  subscribe(agentId: string): AsyncIterable<AgentMessage>;

  // ─────────────────────────────────────────────────────────────
  // Logs & Metrics
  // ─────────────────────────────────────────────────────────────

  /**
   * Get agent logs
   */
  logs(agentId: string, options?: LogOptions): AsyncIterable<string>;

  /**
   * Get agent metrics
   */
  metrics(agentId: string): Promise<AgentMetrics | null>;
}

/**
 * Extended RuntimeProvider with event emitter capabilities
 */
export interface RuntimeProviderWithEvents extends RuntimeProvider, EventEmitter {
  // Event handlers
  on(event: 'agent_started', listener: (agent: AgentHandle) => void): this;
  on(event: 'agent_ready', listener: (agent: AgentHandle) => void): this;
  on(event: 'agent_stopped', listener: (agent: AgentHandle, reason: string) => void): this;
  on(event: 'agent_error', listener: (agent: AgentHandle, error: string) => void): this;
  on(event: 'login_required', listener: (agent: AgentHandle, loginUrl?: string) => void): this;
  on(event: 'message', listener: (message: AgentMessage) => void): this;
  on(event: 'question', listener: (agent: AgentHandle, question: string) => void): this;

  emit(event: 'agent_started', agent: AgentHandle): boolean;
  emit(event: 'agent_ready', agent: AgentHandle): boolean;
  emit(event: 'agent_stopped', agent: AgentHandle, reason: string): boolean;
  emit(event: 'agent_error', agent: AgentHandle, error: string): boolean;
  emit(event: 'login_required', agent: AgentHandle, loginUrl?: string): boolean;
  emit(event: 'message', message: AgentMessage): boolean;
  emit(event: 'question', agent: AgentHandle, question: string): boolean;
}

/**
 * Abstract base class for runtime providers
 */
export abstract class BaseRuntimeProvider extends EventEmitter implements RuntimeProvider {
  abstract readonly name: string;
  abstract readonly type: 'local' | 'docker' | 'kubernetes';

  abstract initialize(): Promise<void>;
  abstract shutdown(stopAgents?: boolean): Promise<void>;
  abstract healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  abstract spawn(config: AgentConfig): Promise<AgentHandle>;
  abstract stop(agentId: string, options?: StopOptions): Promise<void>;
  abstract restart(agentId: string): Promise<AgentHandle>;
  abstract get(agentId: string): Promise<AgentHandle | null>;
  abstract list(filter?: AgentFilter): Promise<AgentHandle[]>;

  abstract send(agentId: string, message: string, options?: SendOptions): Promise<AgentMessage | void>;
  abstract subscribe(agentId: string): AsyncIterable<AgentMessage>;

  abstract logs(agentId: string, options?: LogOptions): AsyncIterable<string>;
  abstract metrics(agentId: string): Promise<AgentMetrics | null>;
}
