import type { HttpClient } from '../http.js';
import type {
  DailyStat,
  Execution,
  ExecutionCancelResponse,
  ExecutionCreateInput,
  ExecutionCreateResponse,
  ExecutionEventsResponse,
  ExecutionListParams,
  ExecutionListResponse,
  ExecutionRetryResponse,
  ExecutionStatsSummary,
  ExecutionStreamEvent,
  ExecutionStreamHandlers,
  HourlyStat,
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
    return this.http.get<Execution>(
      `/api/executions/${encodeURIComponent(id)}`
    );
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
    return this.http.get<ExecutionStatsSummary>(
      '/api/executions/stats/summary'
    );
  }

  /** Get hourly execution statistics */
  async hourlyStats(hours = 24): Promise<{ stats: HourlyStat[] }> {
    return this.http.get<{ stats: HourlyStat[] }>(
      '/api/executions/stats/hourly',
      { hours }
    );
  }

  /** Get daily execution statistics */
  async dailyStats(days = 7): Promise<{ stats: DailyStat[] }> {
    return this.http.get<{ stats: DailyStat[] }>(
      '/api/executions/stats/daily',
      { days }
    );
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

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Execution ${id} did not complete within ${timeoutMs}ms`);
  }

  /**
   * Stream execution events via SSE.
   * Returns an abort function to close the stream.
   *
   * @example
   * ```ts
   * const execution = await client.executions.create({ ... });
   * const abort = client.executions.stream(execution.id, {
   *   onAgentCompleted: (e) => console.log(`${e.data?.agentName} done (${e.data?.confidence})`),
   *   onCompleted: () => console.log('All done'),
   *   onFailed: (e) => console.error('Failed:', e.data?.error),
   * });
   * ```
   */
  stream(id: string, handlers: ExecutionStreamHandlers = {}): () => void {
    const controller = new AbortController();
    const url = this.http.buildStreamUrl(
      `/api/executions/${encodeURIComponent(id)}/events/stream`
    );

    const connect = async () => {
      try {
        const response = await fetch(url, {
          headers: this.http.getAuthHeaders(),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          handlers.onError?.(
            new Error(`Stream failed: ${response.status} ${body}`)
          );
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          handlers.onError?.(new Error('No response body for SSE stream'));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let currentData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              // Event type is also in the data payload
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6);
            } else if (line === '' && currentData) {
              // End of SSE message
              try {
                const event = JSON.parse(currentData) as ExecutionStreamEvent;
                handlers.onEvent?.(event);

                // Route to specific handlers
                switch (event.type) {
                  case 'agent_started':
                    handlers.onAgentStarted?.(event);
                    break;
                  case 'agent_completed':
                    handlers.onAgentCompleted?.(event);
                    break;
                  case 'agent_failed':
                    handlers.onAgentFailed?.(event);
                    break;
                  case 'completed':
                    handlers.onCompleted?.(event);
                    break;
                  case 'failed':
                    handlers.onFailed?.(event);
                    break;
                }
              } catch {
                // Skip malformed events
              }
              currentData = '';
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        handlers.onError?.(
          error instanceof Error ? error : new Error(String(error))
        );
      } finally {
        handlers.onEnd?.();
      }
    };

    connect();

    return () => controller.abort();
  }

  /**
   * Create an execution and immediately stream its events.
   * Returns both the execution response and an abort function.
   *
   * @example
   * ```ts
   * const { execution, abort } = await client.executions.createAndStream(
   *   { patternName: 'MyPattern', input: { task: 'hello' } },
   *   {
   *     onAgentCompleted: (e) => console.log(`${e.data?.agentName}: ${e.data?.confidence}`),
   *     onCompleted: () => console.log('Done!'),
   *   }
   * );
   * ```
   */
  async createAndStream(
    input: ExecutionCreateInput,
    handlers: ExecutionStreamHandlers = {}
  ): Promise<{ execution: ExecutionCreateResponse; abort: () => void }> {
    const execution = await this.create({
      ...input,
      options: { ...input.options, stream: true },
    });
    const abort = this.stream(execution.id, handlers);
    return { execution, abort };
  }
}
