/**
 * Parallax Agent Runtime Types
 *
 * Core type definitions for agent management.
 */

import type { ApprovalPreset } from 'coding-agent-adapters';

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

  /** Override or disable specific adapter auto-response rules for this agent.
   *  Keys are regex source strings (from rule.pattern.source).
   *  - null value disables that rule entirely
   *  - Object value merges fields into the matching adapter rule */
  ruleOverrides?: Record<string, Record<string, unknown> | null>;

  /** Per-agent stall timeout in ms. Overrides the manager-level default. */
  stallTimeoutMs?: number;

  /** Approval preset controlling tool permissions for the spawned agent. */
  approvalPreset?: ApprovalPreset;

  /** Run in interactive mode (default: true).
   *  When true, skips non-interactive CLI flags (--print, --quiet, --non-interactive)
   *  that are incompatible with PTY sessions. Set to false only for piped/headless usage. */
  interactive?: boolean;
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
  | { type: 'question'; agent: AgentHandle; question: string }
  | { type: 'stall_detected'; agent: AgentHandle; recentOutput: string; stallDurationMs: number };

/**
 * Stall classification result (passed through from pty-manager)
 */
export interface StallClassification {
  state: 'waiting_for_input' | 'still_working' | 'task_complete' | 'error';
  prompt?: string;
  suggestedResponse?: string;
}

/**
 * Workspace provisioning configuration for spawn
 */
export interface WorkspaceProvisionConfig {
  /** Repository URL to clone */
  repo: string;
  /** Base branch to create from (default: main) */
  baseBranch?: string;
  /** Git provider (default: github) */
  provider?: string;
  /** User-provided credentials (PAT or OAuth token) */
  credentials?: { type: 'pat' | 'oauth'; token: string };
}
