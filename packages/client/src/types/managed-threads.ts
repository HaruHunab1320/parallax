export interface ManagedThread {
  id: string;
  executionId: string;
  agentType: string;
  name: string;
  objective?: string;
  role?: string;
  status: string;
  runtimeName?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ManagedThreadListResponse {
  threads: ManagedThread[];
  count: number;
}

export interface ManagedThreadListParams {
  status?: string | string[];
  executionId?: string;
  role?: string;
}

export interface SpawnThreadInput {
  executionId: string;
  agentType: string;
  name: string;
  objective: string;
  role?: string;
  workspace?: string;
  environment?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface ThreadInput {
  message?: string;
  raw?: string;
  keys?: string[];
}

export interface ThreadPrepareResponse {
  executionId: string;
  name: string;
  objective: string;
  role?: string;
  preparation: unknown;
  metadata?: Record<string, unknown>;
}

export interface SharedDecision {
  id: string;
  executionId: string;
  threadId: string;
  category: string;
  summary: string;
  details?: unknown;
  createdAt?: string;
}

export interface SharedDecisionListResponse {
  decisions: SharedDecision[];
  count: number;
}

export interface SharedDecisionCreateInput {
  category: string;
  summary: string;
  details?: unknown;
}

export interface EpisodicExperience {
  id: string;
  executionId?: string;
  threadId?: string;
  role?: string;
  repo?: string;
  outcome?: string;
  [key: string]: unknown;
}

export interface EpisodicExperienceListResponse {
  experiences: EpisodicExperience[];
  count: number;
}

export interface EpisodicExperienceListParams {
  executionId?: string;
  threadId?: string;
  role?: string;
  repo?: string;
  outcome?: string;
  limit?: number;
}
