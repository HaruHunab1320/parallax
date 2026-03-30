import type { HttpClient } from '../http.js';
import type {
  EpisodicExperienceListParams,
  EpisodicExperienceListResponse,
  ManagedThread,
  ManagedThreadListParams,
  ManagedThreadListResponse,
  SharedDecision,
  SharedDecisionCreateInput,
  SharedDecisionListResponse,
  SpawnThreadInput,
  ThreadInput,
  ThreadPrepareResponse,
} from '../types/managed-threads.js';

export class ManagedThreadsResource {
  constructor(private http: HttpClient) {}

  /** List all threads */
  async list(
    params?: ManagedThreadListParams
  ): Promise<ManagedThreadListResponse> {
    const query: Record<string, string | undefined> = {};

    if (params?.status) {
      query.status = Array.isArray(params.status)
        ? params.status.join(',')
        : params.status;
    }
    if (params?.executionId) {
      query.executionId = params.executionId;
    }
    if (params?.role) {
      query.role = params.role;
    }

    return this.http.get<ManagedThreadListResponse>(
      '/api/managed-threads',
      query
    );
  }

  /** Spawn a new thread */
  async spawn(
    input: SpawnThreadInput,
    runtime?: string
  ): Promise<ManagedThread> {
    const query = runtime ? { runtime } : undefined;
    return this.http.request<ManagedThread>({
      method: 'POST',
      path: '/api/managed-threads',
      body: input,
      query,
    });
  }

  /** Prepare a thread spawn input (dry-run) */
  async prepare(input: SpawnThreadInput): Promise<ThreadPrepareResponse> {
    return this.http.post<ThreadPrepareResponse>(
      '/api/managed-threads/prepare',
      input
    );
  }

  /** Get threads for a specific execution */
  async byExecution(executionId: string): Promise<ManagedThreadListResponse> {
    return this.http.get<ManagedThreadListResponse>(
      `/api/managed-threads/executions/${encodeURIComponent(executionId)}`
    );
  }

  /** Get shared decisions for an execution */
  async executionDecisions(
    executionId: string,
    params?: { category?: string; limit?: number }
  ): Promise<SharedDecisionListResponse> {
    return this.http.get<SharedDecisionListResponse>(
      `/api/managed-threads/executions/${encodeURIComponent(executionId)}/shared-decisions`,
      { category: params?.category, limit: params?.limit }
    );
  }

  /** Get episodic experiences */
  async experiences(
    params?: EpisodicExperienceListParams
  ): Promise<EpisodicExperienceListResponse> {
    return this.http.get<EpisodicExperienceListResponse>(
      '/api/managed-threads/experiences',
      params as Record<string, string | number | boolean | undefined>
    );
  }

  /** Get a thread by ID */
  async get(id: string): Promise<ManagedThread> {
    return this.http.get<ManagedThread>(
      `/api/managed-threads/${encodeURIComponent(id)}`
    );
  }

  /** Stop a thread */
  async stop(
    id: string,
    options?: { force?: boolean; timeout?: number }
  ): Promise<void> {
    await this.http.delete(`/api/managed-threads/${encodeURIComponent(id)}`, {
      force: options?.force,
      timeout: options?.timeout,
    });
  }

  /** Send input to a thread */
  async send(id: string, input: ThreadInput): Promise<{ sent: boolean }> {
    return this.http.post<{ sent: boolean }>(
      `/api/managed-threads/${encodeURIComponent(id)}/send`,
      input
    );
  }

  /** Get thread events */
  async events(id: string): Promise<{ events: unknown[]; count: number }> {
    return this.http.get<{ events: unknown[]; count: number }>(
      `/api/managed-threads/${encodeURIComponent(id)}/events`
    );
  }

  /** Get shared decisions for a thread */
  async decisions(
    id: string,
    params?: { limit?: number }
  ): Promise<SharedDecisionListResponse> {
    return this.http.get<SharedDecisionListResponse>(
      `/api/managed-threads/${encodeURIComponent(id)}/shared-decisions`,
      { limit: params?.limit }
    );
  }

  /** Create a shared decision for a thread */
  async createDecision(
    id: string,
    input: SharedDecisionCreateInput
  ): Promise<SharedDecision> {
    return this.http.post<SharedDecision>(
      `/api/managed-threads/${encodeURIComponent(id)}/shared-decisions`,
      input
    );
  }
}
