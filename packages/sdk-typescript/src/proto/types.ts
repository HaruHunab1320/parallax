// TypeScript types for Parallax confidence protocol

export interface ConfidenceResult {
  valueJson: string;
  confidence: number;
  agentId: string;
  timestamp: Date;
  uncertainties: string[];
  reasoning: string;
  metadata: Record<string, string>;
}

export interface Capabilities {
  agentId: string;
  name: string;
  capabilities: string[];
  expertiseLevel: number;
  capabilityScores: Record<string, number>;
}

export enum HealthStatus {
  UNKNOWN = 0,
  HEALTHY = 1,
  UNHEALTHY = 2,
  DEGRADED = 3,
}

export interface Health {
  status: HealthStatus;
  message: string;
  lastCheck: Date;
  details: Record<string, string>;
}

export interface AgentRequest {
  taskId: string;
  taskDescription: string;
  data: any;
  context: Record<string, string>;
  timeoutMs: number;
  patternName?: string;
}

// gRPC service interface (for type safety)
export interface ConfidenceAgentService {
  analyze(request: AgentRequest): Promise<ConfidenceResult>;
  getCapabilities(): Promise<Capabilities>;
  healthCheck(): Promise<Health>;
  streamAnalyze(request: AgentRequest): AsyncIterable<ConfidenceResult>;
}