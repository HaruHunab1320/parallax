/**
 * Runtime Interface Types
 *
 * Shared types for Parallax agent runtimes.
 */

/**
 * Supported CLI agent types
 */
export type AgentType = 'claude' | 'codex' | 'gemini' | 'aider' | 'custom';

/**
 * Agent lifecycle states
 */
export type AgentStatus =
  | 'pending'        // Requested, not yet started
  | 'starting'       // Process/container starting
  | 'authenticating' // Waiting for login
  | 'ready'          // Registered and available
  | 'busy'           // Processing a request
  | 'stopping'       // Graceful shutdown
  | 'stopped'        // Terminated
  | 'error';         // Failed state

/**
 * Thread lifecycle states.
 *
 * A thread is the orchestration-level unit of long-lived work. It may be backed
 * by one concrete agent/session, but the control plane reasons about the thread.
 */
export type ThreadStatus =
  | 'pending'
  | 'preparing'
  | 'starting'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'idle'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'stopped';

/**
 * Message types for agent communication
 */
export type MessageType =
  | 'task'           // A task/instruction for the agent
  | 'response'       // Agent's response to a task
  | 'question'       // Agent asking for clarification
  | 'answer'         // Answer to an agent's question
  | 'status'         // Status update
  | 'error';         // Error message

/**
 * Configuration for spawning an agent
 */
export interface AgentConfig {
  // Identity
  id?: string;                    // Auto-generated if not provided
  name: string;                   // Human-readable name
  type: AgentType;                // CLI agent type

  // Capabilities & Role (for org-chart patterns)
  capabilities: string[];         // What this agent can do
  role?: string;                  // Org role: architect, engineer, qa, etc.
  reportsTo?: string;             // Agent ID this one reports to

  // Environment
  workdir?: string;               // Working directory
  env?: Record<string, string>;   // Environment variables

  // Credentials (should be encrypted at rest in production)
  credentials?: AgentCredentials;

  // Resources (for containerized runtimes)
  resources?: {
    cpu?: string;                 // e.g., "1" or "500m"
    memory?: string;              // e.g., "2Gi"
    timeout?: number;             // Max lifetime in seconds
  };

  // Behavior
  autoRestart?: boolean;          // Restart on crash
  idleTimeout?: number;           // Stop after N seconds idle

  // Execution grouping (for shared auth across agents in same execution)
  executionId?: string;           // Groups agents that share credentials
}

/**
 * Agent credentials for various providers
 */
export interface AgentCredentials {
  anthropicKey?: string;          // For Claude
  openaiKey?: string;             // For Codex/GPT
  googleKey?: string;             // For Gemini
  githubToken?: string;           // For repo access
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

  // Connection info (varies by runtime)
  endpoint?: string;              // gRPC/HTTP endpoint if applicable
  pid?: number;                   // Process ID (local runtime)
  containerId?: string;           // Container ID (docker runtime)
  podName?: string;               // Pod name (k8s runtime)

  // Metadata
  role?: string;
  capabilities: string[];
  startedAt?: Date;
  lastActivityAt?: Date;

  // Error info
  error?: string;
  exitCode?: number;
}

/**
 * Optional workspace reference associated with a thread.
 */
export interface ThreadWorkspaceRef {
  workspaceId?: string;
  path?: string;
  repo?: string;
  branch?: string;
  worktreeId?: string;
}

/**
 * Completion details for a thread.
 */
export interface ThreadCompletion {
  state: 'partial' | 'complete' | 'failed';
  summary: string;
  artifacts?: Array<{
    type: 'pr' | 'commit' | 'file' | 'url' | 'report';
    value: string;
  }>;
}

/**
 * Policy controls for long-lived thread supervision.
 */
export interface ThreadPolicy {
  idleTimeoutMs?: number;
  maxIdleChecks?: number;
  autoInterruptOnToolRunning?: boolean;
  maxAutoResponses?: number;
  requireWorkspaceBoundary?: boolean;
  summarizeAfterTurns?: number;
}

export type ThreadApprovalPreset =
  | 'readonly'
  | 'standard'
  | 'permissive'
  | 'autonomous';

export interface ThreadContextFile {
  path: string;
  content: string;
}

export interface ThreadPreparationSpec {
  workspace?: ThreadWorkspaceRef;
  env?: Record<string, string>;
  contextFiles?: ThreadContextFile[];
  approvalPreset?: ThreadApprovalPreset;
}

/**
 * Handle to a running thread.
 */
export interface ThreadHandle {
  id: string;
  executionId: string;
  runtimeName: string;
  agentId?: string;
  agentType: AgentType | string;
  role?: string;
  status: ThreadStatus;
  workspace?: ThreadWorkspaceRef;
  objective: string;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt?: Date;
  summary?: string;
  completion?: ThreadCompletion;
  metadata?: Record<string, unknown>;
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
 * Blocking prompt info for runtime events
 */
export interface BlockingPromptInfo {
  type: string;           // 'login' | 'update' | 'config' | 'tos' | etc.
  prompt?: string;        // The actual prompt text
  options?: string[];     // Available choices
  canAutoRespond: boolean;
  instructions?: string;
  url?: string;
}

/**
 * Event types emitted for threads.
 */
export type ThreadEventType =
  | 'thread_started'
  | 'thread_ready'
  | 'thread_output'
  | 'thread_blocked'
  | 'thread_tool_running'
  | 'thread_turn_complete'
  | 'thread_idle'
  | 'thread_summary_updated'
  | 'thread_completed'
  | 'thread_failed'
  | 'thread_stopped';

/**
 * Normalized thread event.
 */
export interface ThreadEvent {
  threadId: string;
  executionId: string;
  type: ThreadEventType;
  timestamp: Date;
  data?: Record<string, unknown>;
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
  | { type: 'question'; agent: AgentHandle; question: string; context?: string }
  | { type: 'thread_event'; thread: ThreadHandle; event: ThreadEvent };

/**
 * Agent requirement for pattern execution
 */
export interface AgentRequirement {
  type?: AgentType | AgentType[];
  role?: string;
  capabilities: string[];
  count?: number;                 // How many agents with this spec (default: 1)
  preferExisting?: boolean;       // Use existing agent if available (default: true)
}

/**
 * Agent metrics
 */
export interface AgentMetrics {
  cpu?: number;                   // CPU usage percentage
  memory?: number;                // Memory in bytes
  messageCount?: number;          // Messages processed
  uptime?: number;                // Seconds since start
  lastResponseTime?: number;      // Last response latency in ms
}

/**
 * Log entry from an agent
 */
export interface AgentLogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Input for spawning a thread.
 */
export interface SpawnThreadInput {
  id?: string;
  executionId: string;
  name: string;
  agentType: AgentType | string;
  objective: string;
  role?: string;
  preparation?: ThreadPreparationSpec;
  workspace?: ThreadWorkspaceRef;
  env?: Record<string, string>;
  contextFiles?: ThreadContextFile[];
  approvalPreset?: ThreadApprovalPreset;
  metadata?: Record<string, unknown>;
  policy?: ThreadPolicy;
}

/**
 * Input sent to a running thread.
 */
export interface ThreadInput {
  message?: string;
  raw?: string;
  keys?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Filter for listing threads.
 */
export interface ThreadFilter {
  executionId?: string;
  status?: ThreadStatus | ThreadStatus[];
  role?: string;
  agentType?: string | string[];
}
