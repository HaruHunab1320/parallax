/**
 * Org-Chart Pattern Types
 *
 * Types for organizational structure orchestration of multi-agent systems.
 */

import type {
  AgentConfig,
  AgentType,
  ThreadPolicy,
  ThreadWorkspaceRef,
} from '@parallaxai/runtime-interface';

export interface OrgThreadConfig {
  /** Opt this role into thread-backed execution instead of raw agent spawning */
  enabled?: boolean;

  /** Objective used when creating the thread */
  objective?: string;

  /** Approval preset for coding-style runtimes */
  approvalPreset?: 'readonly' | 'standard' | 'permissive' | 'autonomous';

  /** Optional workspace to attach to the thread */
  workspace?: ThreadWorkspaceRef;

  /** Thread supervision policy */
  policy?: ThreadPolicy;

  /** Extra environment variables for the spawned thread */
  env?: Record<string, string>;

  /** Arbitrary metadata to persist on the thread */
  metadata?: Record<string, unknown>;
}

/**
 * Organizational role definition
 */
export interface OrgRole {
  /** Unique role identifier */
  id: string;

  /** Human-readable role name */
  name: string;

  /** Role description */
  description?: string;

  /** Agent type for this role */
  agentType: AgentType | AgentType[];

  /** Required capabilities */
  capabilities: string[];

  /** Role this one reports to */
  reportsTo?: string;

  /** Minimum instances of this role */
  minInstances?: number;

  /** Maximum instances of this role */
  maxInstances?: number;

  /** Whether only one instance can exist */
  singleton?: boolean;

  /** Topics this role can answer questions about */
  expertise?: string[];

  /** Default agent configuration overrides */
  agentConfig?: Partial<AgentConfig>;

  /** Optional thread-backed execution config */
  threadConfig?: OrgThreadConfig;
}

/**
 * Message routing rule
 */
export interface RoutingRule {
  /** Source role(s) */
  from: string | string[];

  /** Destination role(s) */
  to: string | string[];

  /** Topics this rule applies to */
  topics?: string[];

  /** Message types this rule applies to */
  messageTypes?: ('task' | 'question' | 'response' | 'status')[];

  /** Priority (lower = higher priority) */
  priority?: number;

  /** Whether to broadcast to all instances of target role */
  broadcast?: boolean;
}

/**
 * Escalation configuration
 */
export interface EscalationConfig {
  /** Default behavior for unrouted questions */
  defaultBehavior: 'route_to_reports_to' | 'broadcast' | 'surface_to_user';

  /** Topic-specific routing overrides */
  topicRoutes?: Record<string, string>;

  /** Timeout before escalating (ms) */
  timeoutMs?: number;

  /** Maximum escalation depth */
  maxDepth?: number;

  /** What to do if max depth reached */
  onMaxDepth: 'surface_to_user' | 'fail' | 'return_best_effort';
}

/**
 * Organizational structure definition
 */
export interface OrgStructure {
  /** Structure name */
  name: string;

  /** Structure description */
  description?: string;

  /** Role definitions */
  roles: Record<string, OrgRole>;

  /** Message routing rules */
  routing?: RoutingRule[];

  /** Escalation configuration */
  escalation?: EscalationConfig;
}

/**
 * Workflow step types
 */
export type WorkflowStep =
  | { type: 'assign'; role: string; task: string; input?: any }
  | { type: 'parallel'; steps: WorkflowStep[] }
  | { type: 'sequential'; steps: WorkflowStep[] }
  | {
      type: 'select';
      role: string;
      criteria?: 'availability' | 'expertise' | 'round_robin';
    }
  | { type: 'review'; reviewer: string; subject: any }
  | { type: 'approve'; approver: string; subject: any }
  | { type: 'aggregate'; method: 'consensus' | 'majority' | 'merge' | 'best' }
  | {
      type: 'condition';
      check: string;
      then: WorkflowStep;
      else?: WorkflowStep;
    };

/**
 * Workflow definition
 */
export interface OrgWorkflow {
  /** Workflow name */
  name: string;

  /** Input schema */
  input?: Record<string, any>;

  /** Workflow steps */
  steps: WorkflowStep[];

  /** Output mapping */
  output?: string;
}

/**
 * Complete org-chart pattern definition
 */
export interface OrgPattern {
  /** Pattern name */
  name: string;

  /** Pattern version */
  version?: string;

  /** Pattern description */
  description?: string;

  /** Organizational structure */
  structure: OrgStructure;

  /** Workflow definition */
  workflow: OrgWorkflow;

  /** Pattern metadata */
  metadata?: Record<string, any>;
}

/** Shared fields for all org execution units */
interface OrgInstanceBase {
  /** Instance ID (agent ID or thread ID) */
  id: string;

  /** Assigned role */
  role: string;

  /** Current status */
  status: 'idle' | 'busy' | 'waiting' | 'error';

  /** Current task (if busy) */
  currentTask?: string;

  /** Questions waiting for answers */
  pendingQuestions?: Array<{
    id: string;
    question: string;
    askedAt: Date;
  }>;
}

/** An agent-backed execution unit (direct gRPC connection) */
export interface OrgAgentUnit extends OrgInstanceBase {
  kind: 'agent';
  /** Agent gRPC endpoint */
  endpoint: string;
  threadId?: undefined;
}

/** A thread-backed execution unit (managed via gateway) */
export interface OrgThreadUnit extends OrgInstanceBase {
  kind: 'thread';
  /** Backing thread ID */
  threadId: string;
  endpoint?: string;
}

/**
 * Agent or thread instance in an org execution.
 * Discriminated union on `kind` — use narrowing to access variant-specific fields.
 */
export type OrgAgentInstance = OrgAgentUnit | OrgThreadUnit;

/**
 * Org pattern execution context
 */
export interface OrgExecutionContext {
  /** Execution ID */
  id: string;

  /** Pattern being executed */
  pattern: OrgPattern;

  /** Agent instances */
  agents: Map<string, OrgAgentInstance>;

  /** Role to agent mapping */
  roleAssignments: Map<string, string[]>;

  /** Execution state */
  state: 'initializing' | 'running' | 'waiting' | 'completed' | 'failed';

  /** Variables */
  variables: Map<string, any>;

  /** Execution start time */
  startedAt: Date;

  /** Current workflow step index */
  currentStep?: number;
}

/**
 * Question event for escalation
 */
export interface AgentQuestion {
  /** Question ID */
  id: string;

  /** Agent asking the question */
  agentId: string;

  /** Agent's role */
  role: string;

  /** The question text */
  question: string;

  /** Detected topic (for routing) */
  topic?: string;

  /** Context for the question */
  context?: any;

  /** When the question was asked */
  askedAt: Date;

  /** Escalation history */
  escalationPath?: string[];
}

/**
 * Answer to an agent question
 */
export interface AgentAnswer {
  /** Question ID being answered */
  questionId: string;

  /** Agent providing the answer */
  agentId: string;

  /** Agent's role */
  role: string;

  /** The answer text */
  answer: string;

  /** Confidence in the answer */
  confidence?: number;

  /** When the answer was provided */
  answeredAt: Date;
}
