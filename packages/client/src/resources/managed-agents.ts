import { HttpClient } from '../http.js';
import {
  ManagedAgent,
  ManagedAgentListResponse,
  ManagedAgentListParams,
  ManagedAgentSpawnInput,
  ManagedAgentSendInput,
  ManagedAgentSendResponse,
  RuntimeListResponse,
  RuntimeHealthResponse,
  AgentLogsResponse,
} from '../types/managed-agents.js';

export class ManagedAgentsResource {
  constructor(private http: HttpClient) {}

  /** List available runtimes */
  async runtimes(): Promise<RuntimeListResponse> {
    return this.http.get<RuntimeListResponse>('/api/managed-agents/runtimes');
  }

  /** Get runtime health */
  async runtimeHealth(name: string): Promise<RuntimeHealthResponse> {
    return this.http.get<RuntimeHealthResponse>(
      `/api/managed-agents/runtimes/${encodeURIComponent(name)}/health`
    );
  }

  /** List all managed agents */
  async list(params?: ManagedAgentListParams): Promise<ManagedAgentListResponse> {
    const query: Record<string, string | undefined> = {};

    if (params?.status) {
      query.status = Array.isArray(params.status) ? params.status.join(',') : params.status;
    }
    if (params?.type) {
      query.type = Array.isArray(params.type) ? params.type.join(',') : params.type;
    }
    if (params?.role) {
      query.role = params.role;
    }

    return this.http.get<ManagedAgentListResponse>('/api/managed-agents', query);
  }

  /** Spawn a new managed agent */
  async spawn(input: ManagedAgentSpawnInput, runtime?: string): Promise<ManagedAgent> {
    const query = runtime ? { runtime } : undefined;
    return this.http.request<ManagedAgent>({
      method: 'POST',
      path: '/api/managed-agents',
      body: input,
      query,
    });
  }

  /** Get a managed agent by ID */
  async get(id: string): Promise<ManagedAgent> {
    return this.http.get<ManagedAgent>(
      `/api/managed-agents/${encodeURIComponent(id)}`
    );
  }

  /** Stop a managed agent */
  async stop(id: string, options?: { force?: boolean; timeout?: number }): Promise<void> {
    await this.http.delete(
      `/api/managed-agents/${encodeURIComponent(id)}`,
      {
        force: options?.force,
        timeout: options?.timeout,
      }
    );
  }

  /** Send a message to a managed agent */
  async send(id: string, input: ManagedAgentSendInput): Promise<ManagedAgentSendResponse> {
    return this.http.post<ManagedAgentSendResponse>(
      `/api/managed-agents/${encodeURIComponent(id)}/send`,
      input
    );
  }

  /** Get agent logs */
  async logs(id: string, tail = 100): Promise<AgentLogsResponse> {
    return this.http.get<AgentLogsResponse>(
      `/api/managed-agents/${encodeURIComponent(id)}/logs`,
      { tail }
    );
  }

  /** Get agent metrics */
  async metrics(id: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(
      `/api/managed-agents/${encodeURIComponent(id)}/metrics`
    );
  }
}
