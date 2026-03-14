export interface Agent {
  id: string;
  name: string;
  endpoint?: string;
  capabilities: string[];
  status: string;
  metadata?: Record<string, unknown>;
  lastSeen?: string | Date;
  source?: string;
}

export interface AgentListResponse {
  agents: Agent[];
  count: number;
  byCapability: Record<string, Agent[]>;
  timestamp: string;
}

export interface AgentHealthResponse {
  agentId: string;
  status: 'healthy' | 'unhealthy';
  error?: string;
  timestamp: string;
}

export interface AgentTestInput {
  task: string;
  data: unknown;
}

export interface AgentTestResponse {
  agentId: string;
  result: unknown;
  confidence: number;
  reasoning?: string;
  timestamp?: string;
}

export interface CapabilityStats {
  stats: Array<{
    capability: string;
    agent_count: number;
    active_count: number;
  }>;
}

export interface AgentDeleteResponse {
  deleted: string;
}

export interface AgentBulkDeleteResponse {
  deleted: number;
  thresholdSeconds: number;
}
