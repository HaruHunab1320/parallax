export interface Pattern {
  name: string;
  version?: string;
  description?: string;
  script?: string;
  input?: Record<string, unknown>;
  agents?: {
    capabilities?: string[];
    minAgents?: number;
    maxAgents?: number;
  };
  minAgents?: number;
  maxAgents?: number;
  metadata?: Record<string, unknown>;
  source?: string;
}

export interface PatternListResponse {
  patterns: Pattern[];
  count: number;
}

export interface PatternValidation {
  valid: boolean;
  errors: string[];
}

export interface PatternExecuteOptions {
  timeout?: number;
  stream?: boolean;
}

export interface PatternExecution {
  id: string;
  patternName?: string;
  result?: unknown;
  confidence?: number;
  metrics?: {
    averageConfidence?: number;
    agentsUsed?: number;
    [key: string]: unknown;
  };
  startTime?: string;
  endTime?: string;
  status?: string;
}

export interface PatternExecuteResponse {
  execution: PatternExecution;
  duration: number;
}

export interface PatternMetricsResponse {
  pattern: string;
  stats: {
    totalExecutions: number;
    avgDuration: number;
    avgConfidence: number;
    successRate: number;
    recentExecutions: unknown[];
  };
  metrics: unknown[];
}

export interface PatternCreateInput {
  name: string;
  script: string;
  version?: string;
  description?: string;
  input?: Record<string, unknown>;
  minAgents?: number;
  maxAgents?: number;
  metadata?: Record<string, unknown>;
}

export interface PatternUploadInput {
  filename: string;
  content: string;
  overwrite?: boolean;
}

export interface PatternUploadResponse {
  pattern: Pattern;
  compiled?: boolean;
}

export interface PatternBatchUploadInput {
  files: Array<{ filename: string; content: string }>;
  overwrite?: boolean;
}

export interface PatternBatchUploadResponse {
  results: Array<{
    filename: string;
    success: boolean;
    pattern?: Pattern;
    error?: string;
  }>;
}

export interface PatternVersionsResponse {
  pattern: string;
  versions: unknown[];
}
