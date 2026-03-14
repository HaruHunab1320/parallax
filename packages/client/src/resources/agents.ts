import { HttpClient } from '../http.js';
import {
  Agent,
  AgentListResponse,
  AgentHealthResponse,
  AgentTestInput,
  AgentTestResponse,
  CapabilityStats,
  AgentDeleteResponse,
  AgentBulkDeleteResponse,
} from '../types/agents.js';

export class AgentsResource {
  constructor(private http: HttpClient) {}

  /** List all agents (merged from database + registry) */
  async list(): Promise<AgentListResponse> {
    return this.http.get<AgentListResponse>('/api/agents');
  }

  /** Get agent details by ID */
  async get(id: string): Promise<Agent> {
    return this.http.get<Agent>(`/api/agents/${encodeURIComponent(id)}`);
  }

  /** Health check an agent */
  async health(id: string): Promise<AgentHealthResponse> {
    return this.http.get<AgentHealthResponse>(
      `/api/agents/${encodeURIComponent(id)}/health`
    );
  }

  /** Test an agent with a task */
  async test(id: string, input: AgentTestInput): Promise<AgentTestResponse> {
    return this.http.post<AgentTestResponse>(
      `/api/agents/${encodeURIComponent(id)}/test`,
      input
    );
  }

  /** Get capability statistics across all agents */
  async capabilityStats(): Promise<CapabilityStats> {
    return this.http.get<CapabilityStats>('/api/agents/stats/capabilities');
  }

  /** Update agent status (active, inactive, error) */
  async updateStatus(id: string, status: 'active' | 'inactive' | 'error'): Promise<Agent> {
    return this.http.patch<Agent>(
      `/api/agents/${encodeURIComponent(id)}/status`,
      { status }
    );
  }

  /** Delete an agent */
  async delete(id: string): Promise<AgentDeleteResponse> {
    return this.http.delete<AgentDeleteResponse>(
      `/api/agents/${encodeURIComponent(id)}`
    );
  }

  /** Bulk delete stale agents */
  async deleteStale(thresholdSeconds = 300): Promise<AgentBulkDeleteResponse> {
    return this.http.delete<AgentBulkDeleteResponse>('/api/agents', {
      stale: 'true',
      threshold: thresholdSeconds,
    });
  }
}
