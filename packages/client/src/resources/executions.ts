import { HttpClient } from '../http.js';
import {
  Execution,
  ExecutionListResponse,
  ExecutionListParams,
  ExecutionCreateInput,
  ExecutionCreateResponse,
  ExecutionEventsResponse,
  ExecutionCancelResponse,
  ExecutionRetryResponse,
  ExecutionStatsSummary,
  HourlyStat,
  DailyStat,
} from '../types/executions.js';

export class ExecutionsResource {
  constructor(private http: HttpClient) {}

  /** List executions with optional filters */
  async list(params?: ExecutionListParams): Promise<ExecutionListResponse> {
    return this.http.get<ExecutionListResponse>('/api/executions', {
      limit: params?.limit,
      offset: params?.offset,
      status: params?.status,
    });
  }

  /** Get execution details by ID */
  async get(id: string): Promise<Execution> {
    return this.http.get<Execution>(`/api/executions/${encodeURIComponent(id)}`);
  }

  /** Create a new async execution (returns 202 with execution ID) */
  async create(input: ExecutionCreateInput): Promise<ExecutionCreateResponse> {
    return this.http.post<ExecutionCreateResponse>('/api/executions', input);
  }

  /** Get events for an execution */
  async events(id: string): Promise<ExecutionEventsResponse> {
    return this.http.get<ExecutionEventsResponse>(
      `/api/executions/${encodeURIComponent(id)}/events`
    );
  }

  /** Cancel a running execution */
  async cancel(id: string): Promise<ExecutionCancelResponse> {
    return this.http.post<ExecutionCancelResponse>(
      `/api/executions/${encodeURIComponent(id)}/cancel`
    );
  }

  /** Get retry info for a failed execution */
  async retry(id: string): Promise<ExecutionRetryResponse> {
    return this.http.post<ExecutionRetryResponse>(
      `/api/executions/${encodeURIComponent(id)}/retry`
    );
  }

  /** Get execution statistics summary */
  async stats(): Promise<ExecutionStatsSummary> {
    return this.http.get<ExecutionStatsSummary>('/api/executions/stats/summary');
  }

  /** Get hourly execution statistics */
  async hourlyStats(hours = 24): Promise<{ stats: HourlyStat[] }> {
    return this.http.get<{ stats: HourlyStat[] }>('/api/executions/stats/hourly', { hours });
  }

  /** Get daily execution statistics */
  async dailyStats(days = 7): Promise<{ stats: DailyStat[] }> {
    return this.http.get<{ stats: DailyStat[] }>('/api/executions/stats/daily', { days });
  }

  /**
   * Poll an execution until it completes or fails.
   *
   * @param id - Execution ID to poll
   * @param intervalMs - Polling interval (default: 2000)
   * @param timeoutMs - Maximum wait time (default: 300000 = 5 min)
   */
  async waitForCompletion(
    id: string,
    intervalMs = 2000,
    timeoutMs = 300000
  ): Promise<Execution> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const execution = await this.get(id);

      if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Execution ${id} did not complete within ${timeoutMs}ms`);
  }
}
