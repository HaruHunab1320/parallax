export interface Execution {
  id: string;
  patternName?: string;
  input?: unknown;
  status: string;
  result?: unknown;
  confidence?: number;
  error?: string;
  startTime?: string;
  endTime?: string;
  metrics?: Record<string, unknown>;
}

export interface ExecutionListResponse {
  executions: Execution[];
  total: number;
  limit: number;
  offset: number;
}

export interface ExecutionListParams {
  limit?: number;
  offset?: number;
  status?: string;
}

export interface ExecutionCreateInput {
  patternName: string;
  input: unknown;
  options?: {
    timeout?: number;
    stream?: boolean;
    credentials?: {
      type: 'pat' | 'oauth';
      token: string;
    };
  };
  webhook?: {
    url: string;
    secret?: string;
    headers?: Record<string, string>;
  };
}

export interface ExecutionCreateResponse {
  id: string;
  status: string;
  message: string;
  streamUrl?: string;
  webhookConfigured?: boolean;
}

export interface ExecutionEventsResponse {
  events: unknown[];
}

export interface ExecutionCancelResponse {
  message: string;
  id: string;
}

export interface ExecutionRetryResponse {
  message: string;
  retryRequest: ExecutionCreateInput;
  hint: string;
}

export interface ExecutionStatsSummary {
  total_executions: number;
  successful: number;
  failed: number;
  cancelled: number;
  in_progress: number;
  avg_duration_ms: number | null;
  avg_confidence: number | null;
}

export interface HourlyStat {
  hour: string;
  executions: number;
  successful: number;
  failed: number;
  avg_confidence: number | null;
}

export interface DailyStat {
  day: string;
  executions: number;
  successful: number;
  failed: number;
  avg_confidence: number | null;
  avg_duration_ms: number | null;
}

/** A single event from the execution event stream */
export interface ExecutionStreamEvent {
  executionId: string;
  type: string;
  data?: {
    agentId?: string;
    agentName?: string;
    confidence?: number;
    error?: string;
    count?: number;
    successCount?: number;
    failureCount?: number;
    patternName?: string;
    [key: string]: unknown;
  };
  timestamp: string;
}

/** Handlers for the execution event stream */
export interface ExecutionStreamHandlers {
  /** Called for every event */
  onEvent?: (event: ExecutionStreamEvent) => void;
  /** Called when a specific agent starts its task */
  onAgentStarted?: (event: ExecutionStreamEvent) => void;
  /** Called when a specific agent completes its task */
  onAgentCompleted?: (event: ExecutionStreamEvent) => void;
  /** Called when a specific agent fails */
  onAgentFailed?: (event: ExecutionStreamEvent) => void;
  /** Called when the execution completes */
  onCompleted?: (event: ExecutionStreamEvent) => void;
  /** Called when the execution fails */
  onFailed?: (event: ExecutionStreamEvent) => void;
  /** Called on stream error */
  onError?: (error: Error) => void;
  /** Called when the stream ends */
  onEnd?: () => void;
}
