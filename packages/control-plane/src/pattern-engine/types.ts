export interface Pattern {
  name: string;
  version: string;
  description: string;
  input: PatternInput;
  agents?: AgentRequirement;
  minAgents?: number;
  maxAgents?: number;
  script: string;
  metadata?: Record<string, any>;
  /**
   * Workspace configuration for patterns that need git access
   */
  workspace?: PatternWorkspaceConfig;
}

export interface PatternWorkspaceConfig {
  /**
   * Whether this pattern requires a git workspace
   */
  enabled: boolean;
  /**
   * Repository to clone (can be overridden by input)
   */
  repo?: string;
  /**
   * Base branch (default: main)
   */
  baseBranch?: string;
  /**
   * Branch strategy: feature_branch, direct, fork
   */
  branchStrategy?: 'feature_branch' | 'direct' | 'fork';
  /**
   * Whether to auto-create PR after execution
   */
  createPr?: boolean;
  /**
   * PR configuration
   */
  pr?: {
    draft?: boolean;
    labels?: string[];
    reviewers?: string[];
  };
}

export interface PatternInput {
  type: string;
  required?: boolean;
  schema?: any; // JSON Schema
}

export interface AgentRequirement {
  capabilities?: string[];
  minConfidence?: number;
  selector?: string; // Prism expression
}

export interface PatternExecution {
  id: string;
  patternName: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed';
  input?: any;
  result?: any;
  error?: string;
  metrics?: ExecutionMetrics;
  confidence?: number;
  warnings?: Array<{
    type: string;
    message: string;
    upgrade_url?: string;
  }>;
  /**
   * Workspace info if pattern uses git workspace
   */
  workspace?: {
    id: string;
    path: string;
    repo: string;
    branch: string;
    baseBranch: string;
    prUrl?: string;
    prNumber?: number;
  };
}

export interface ExecutionMetrics {
  totalExecutions?: number;
  agentsUsed?: number;
  averageConfidence?: number;
  executionTime?: number;
  parallelPaths?: number;
  completedExecutions?: number;
  failedExecutions?: number;
  activeExecutions?: number;
  successfulExecutions?: number;
  averageDuration?: number;
  // For individual execution metrics
  pattern?: string;
  patternName?: string;
  timestamp?: string;
  duration?: number;
  confidence?: number;
  success?: boolean;
  agentCount?: number;
  warnings?: string[];
}
