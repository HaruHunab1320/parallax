export interface AgentResult<T = any> {
  value: T;
  confidence: number;
  agent: string;
  reasoning?: string;
  uncertainties?: string[];
  timestamp: number;
}

export interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  endpoint?: string;
  isAvailable(): Promise<boolean>;
  analyze<T>(task: string, data?: any): Promise<AgentResult<T>>;
}

export interface CoordinationPattern {
  name: string;
  description: string;
  execute<T>(agents: Agent[], task: string, data?: any): Promise<T>;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceThresholds {
  high: number;    // >= 0.8
  medium: number;  // >= 0.5
  low: number;     // < 0.5
}