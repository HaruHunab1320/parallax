/**
 * Org-Chart Compiler Types
 *
 * Standalone type definitions for organizational structure patterns.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Role Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Organizational role definition
 */
export interface OrgRole {
  /** Unique role identifier (key in roles record) */
  id?: string;

  /** Human-readable role name */
  name?: string;

  /** Role description */
  description?: string;

  /** Agent/worker type for this role (generic string, not enum) */
  type?: string | string[];

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

  /** Custom metadata */
  metadata?: Record<string, unknown>;
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

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assign a task to a role
 */
export interface AssignStep {
  type: 'assign';
  role: string;
  task: string;
  input?: Record<string, unknown>;
  timeout?: number;
}

/**
 * Execute steps in parallel
 */
export interface ParallelStep {
  type: 'parallel';
  steps: WorkflowStep[];
  maxConcurrency?: number;
}

/**
 * Execute steps sequentially
 */
export interface SequentialStep {
  type: 'sequential';
  steps: WorkflowStep[];
}

/**
 * Select an agent from a role
 */
export interface SelectStep {
  type: 'select';
  role: string;
  criteria?: 'availability' | 'expertise' | 'round_robin' | 'best';
}

/**
 * Request a review from a role
 */
export interface ReviewStep {
  type: 'review';
  reviewer: string;
  subject: string;
  maxIterations?: number;
}

/**
 * Request approval from a role
 */
export interface ApproveStep {
  type: 'approve';
  approver: string;
  subject: string;
}

/**
 * Aggregate multiple results
 */
export interface AggregateStep {
  type: 'aggregate';
  method: 'consensus' | 'majority' | 'merge' | 'best' | 'custom';
  sources?: string[];
  customFn?: string;
}

/**
 * Conditional branching
 */
export interface ConditionStep {
  type: 'condition';
  check: string;
  then: WorkflowStep;
  else?: WorkflowStep;
}

/**
 * Wait for a condition or timeout
 */
export interface WaitStep {
  type: 'wait';
  condition?: string;
  timeout?: number;
}

/**
 * All workflow step types
 */
export type WorkflowStep =
  | AssignStep
  | ParallelStep
  | SequentialStep
  | SelectStep
  | ReviewStep
  | ApproveStep
  | AggregateStep
  | ConditionStep
  | WaitStep;

/**
 * Workflow definition
 */
export interface OrgWorkflow {
  /** Workflow name */
  name: string;

  /** Workflow description */
  description?: string;

  /** Input schema */
  input?: Record<string, unknown>;

  /** Workflow steps */
  steps: WorkflowStep[];

  /** Output variable reference */
  output?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Types
// ─────────────────────────────────────────────────────────────────────────────

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
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compilation Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compiler options
 */
export interface CompileOptions {
  /** Target output format */
  target?: string | CompileTarget;

  /** Include comments in output */
  includeComments?: boolean;

  /** Pretty print output */
  prettyPrint?: boolean;

  /** Custom variables to inject */
  variables?: Record<string, unknown>;
}

/**
 * Compilation context passed to targets
 */
export interface CompileContext {
  /** The pattern being compiled */
  pattern: OrgPattern;

  /** Target name */
  targetName: string;

  /** Variable mappings */
  variables: Map<string, string>;

  /** Step result references */
  stepResults: Map<string, string>;

  /** Current indentation level */
  indent: number;

  /** Whether to include comments */
  includeComments: boolean;

  /** Add a variable reference */
  addVariable(name: string, reference: string): void;

  /** Get indentation string */
  getIndent(): string;
}

/**
 * Compile target interface
 */
export interface CompileTarget {
  /** Target name */
  name: string;

  /** Output format */
  format: 'code' | 'json' | 'yaml';

  /** Emit header (imports, setup) */
  emitHeader?(pattern: OrgPattern, ctx: CompileContext): string;

  /** Emit role definition */
  emitRole(role: OrgRole, roleId: string, ctx: CompileContext): string;

  /** Emit complete workflow */
  emitWorkflow(workflow: OrgWorkflow, ctx: CompileContext): string;

  /** Emit individual step */
  emitStep(step: WorkflowStep, stepIndex: number, ctx: CompileContext): string;

  /** Emit footer (exports, cleanup) */
  emitFooter?(pattern: OrgPattern, ctx: CompileContext): string;

  /** Join all parts */
  join(parts: string[]): string;
}

/**
 * Compiled pattern result
 */
export interface CompileResult {
  /** Original pattern name */
  name: string;

  /** Generated output */
  output: string;

  /** Target format used */
  format: 'code' | 'json' | 'yaml';

  /** Pattern metadata */
  metadata: PatternMetadata;
}

/**
 * Pattern metadata
 */
export interface PatternMetadata {
  name: string;
  version: string;
  description: string;
  input: Record<string, unknown>;
  capabilities: string[];
  agentCounts: { min: number; max: number };
  roles: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validation error
 */
export interface ValidationError {
  /** Error path (e.g., 'structure.roles.engineer.capabilities') */
  path: string;

  /** Error message */
  message: string;

  /** Error severity */
  severity: 'error' | 'warning';
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the pattern is valid */
  valid: boolean;

  /** Validation errors */
  errors: ValidationError[];

  /** Validation warnings */
  warnings: ValidationError[];
}
