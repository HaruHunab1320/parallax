import type { HttpClient } from '../http.js';
import type {
  Schedule,
  ScheduleCreateInput,
  ScheduleListParams,
  ScheduleListResponse,
  ScheduleRun,
  ScheduleRunsResponse,
  ScheduleUpdateInput,
} from '../types/schedules.js';

export class SchedulesResource {
  constructor(private http: HttpClient) {}

  /** List schedules with optional filters (Enterprise) */
  async list(params?: ScheduleListParams): Promise<ScheduleListResponse> {
    return this.http.get<ScheduleListResponse>('/api/schedules', {
      status: params?.status,
      patternName: params?.patternName,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  /** Get a schedule by ID (Enterprise) */
  async get(id: string): Promise<Schedule> {
    return this.http.get<Schedule>(`/api/schedules/${encodeURIComponent(id)}`);
  }

  /** Create a new schedule (Enterprise) */
  async create(input: ScheduleCreateInput): Promise<Schedule> {
    return this.http.post<Schedule>('/api/schedules', {
      ...input,
      startAt:
        input.startAt instanceof Date
          ? input.startAt.toISOString()
          : input.startAt,
      endAt:
        input.endAt instanceof Date ? input.endAt.toISOString() : input.endAt,
    });
  }

  /** Update a schedule (Enterprise) */
  async update(id: string, updates: ScheduleUpdateInput): Promise<Schedule> {
    return this.http.put<Schedule>(`/api/schedules/${encodeURIComponent(id)}`, {
      ...updates,
      startAt:
        updates.startAt instanceof Date
          ? updates.startAt.toISOString()
          : updates.startAt,
      endAt:
        updates.endAt instanceof Date
          ? updates.endAt.toISOString()
          : updates.endAt,
    });
  }

  /** Delete a schedule (Enterprise) */
  async delete(id: string): Promise<void> {
    await this.http.delete(`/api/schedules/${encodeURIComponent(id)}`);
  }

  /** Pause a schedule (Enterprise) */
  async pause(id: string): Promise<Schedule> {
    return this.http.post<Schedule>(
      `/api/schedules/${encodeURIComponent(id)}/pause`
    );
  }

  /** Resume a paused schedule (Enterprise) */
  async resume(id: string): Promise<Schedule> {
    return this.http.post<Schedule>(
      `/api/schedules/${encodeURIComponent(id)}/resume`
    );
  }

  /** Manually trigger a schedule (Enterprise) */
  async trigger(id: string): Promise<ScheduleRun> {
    return this.http.post<ScheduleRun>(
      `/api/schedules/${encodeURIComponent(id)}/trigger`
    );
  }

  /** Get run history for a schedule (Enterprise) */
  async runs(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<ScheduleRunsResponse> {
    return this.http.get<ScheduleRunsResponse>(
      `/api/schedules/${encodeURIComponent(id)}/runs`,
      { limit: params?.limit, offset: params?.offset }
    );
  }
}
