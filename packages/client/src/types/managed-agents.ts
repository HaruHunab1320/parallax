export interface ManagedAgent {
  id: string;
  name: string;
  type: string;
  status: string;
  capabilities?: string[];
  runtimeName?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ManagedAgentListResponse {
  agents: ManagedAgent[];
  count: number;
}

export interface ManagedAgentListParams {
  status?: string | string[];
  type?: string | string[];
  role?: string;
}

export interface ManagedAgentSpawnInput {
  type: string;
  name: string;
  capabilities?: string[];
  objective?: string;
  role?: string;
  workspace?: string;
  environment?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface ManagedAgentSendInput {
  message: string;
  expectResponse?: boolean;
  timeout?: number;
}

export interface ManagedAgentSendResponse {
  sent: boolean;
  response?: unknown;
}

export interface RuntimeInfo {
  name: string;
  type: string;
  available: boolean;
  [key: string]: unknown;
}

export interface RuntimeListResponse {
  runtimes: RuntimeInfo[];
}

export interface RuntimeHealthResponse {
  name?: string;
  healthy?: boolean;
  [key: string]: unknown;
}

export interface AgentLogsResponse {
  logs: string[];
  count: number;
}
