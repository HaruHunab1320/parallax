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
}
