/**
 * Parallax Agent Runtime Types
 *
 * Core type definitions for agent management.
 */

/**
 * Supported AI agent types
 */
export type AgentType = 'claude' | 'codex' | 'gemini' | 'aider' | 'custom';

/**
 * Agent lifecycle states
 */
export type AgentStatus =
  | 'pending'
  | 'starting'
  | 'authenticating'
  | 'ready'
  | 'busy'
  | 'stopping'
  | 'stopped'
  | 'error';

/**
 * Message types for agent communication
 */
export type MessageType =
  | 'task'
  | 'response'
  | 'question'
  | 'answer'
  | 'status'
  | 'error';

/**
 * Configuration for spawning an agent
 */
export interface AgentConfig {
  id?: string;
  name: string;
  type: AgentType;
  capabilities: string[];
  role?: string;
  reportsTo?: string;
  workdir?: string;
  env?: Record<string, string>;
  credentials?: AgentCredentials;
  autoRestart?: boolean;
  idleTimeout?: number;
}

/**
 * Agent credentials
 */
export interface AgentCredentials {
  anthropicKey?: string;
  openaiKey?: string;
  googleKey?: string;
  githubToken?: string;
  custom?: Record<string, string>;
}

/**
 * Handle to a running agent
 */
export interface AgentHandle {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  pid?: number;
  role?: string;
  capabilities: string[];
  startedAt?: Date;
  lastActivityAt?: Date;
  error?: string;
  exitCode?: number;
}

/**
 * Message to/from an agent
 */
export interface AgentMessage {
  id: string;
  agentId: string;
  direction: 'inbound' | 'outbound';
  type: MessageType;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Filter for listing agents
 */
export interface AgentFilter {
  status?: AgentStatus | AgentStatus[];
  type?: AgentType | AgentType[];
  role?: string;
  capabilities?: string[];
}

/**
 * Agent metrics
 */
export interface AgentMetrics {
  uptime?: number;
  messageCount?: number;
  cpu?: number;
  memory?: number;
}

/**
 * Blocking prompt info
 */
export interface BlockingPromptInfo {
  type: string;
  prompt?: string;
  options?: string[];
  canAutoRespond: boolean;
  instructions?: string;
  url?: string;
}

/**
 * Runtime events
 */
export type RuntimeEvent =
  | { type: 'agent_started'; agent: AgentHandle }
  | { type: 'agent_ready'; agent: AgentHandle }
  | { type: 'agent_stopped'; agent: AgentHandle; reason: string }
  | { type: 'agent_error'; agent: AgentHandle; error: string }
  | { type: 'login_required'; agent: AgentHandle; loginUrl?: string; loginInstructions?: string }
  | { type: 'blocking_prompt'; agent: AgentHandle; prompt: BlockingPromptInfo; autoResponded: boolean }
  | { type: 'message'; message: AgentMessage }
  | { type: 'question'; agent: AgentHandle; question: string };
