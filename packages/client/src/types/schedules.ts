export interface Schedule {
  id: string;
  name: string;
  patternName: string;
  description?: string;
  cronExpression?: string;
  intervalMs?: number;
  timezone?: string;
  input?: Record<string, unknown>;
  startAt?: string;
  endAt?: string;
  maxRuns?: number;
  retryPolicy?: RetryPolicy;
  metadata?: Record<string, unknown>;
  status: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: string;
  runCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier?: number;
}

export interface ScheduleListResponse {
  schedules: Schedule[];
  count: number;
}

export interface ScheduleListParams {
  status?: string;
  patternName?: string;
  limit?: number;
  offset?: number;
}

export interface ScheduleCreateInput {
  name: string;
  patternName: string;
  description?: string;
  cron?: string;
  intervalMs?: number;
  timezone?: string;
  input?: Record<string, unknown>;
  startAt?: string | Date;
  endAt?: string | Date;
  maxRuns?: number;
  retryPolicy?: RetryPolicy;
  metadata?: Record<string, unknown>;
}

export interface ScheduleUpdateInput {
  name?: string;
  patternName?: string;
  description?: string;
  cron?: string;
  intervalMs?: number;
  timezone?: string;
  input?: Record<string, unknown>;
  startAt?: string | Date;
  endAt?: string | Date;
  maxRuns?: number;
  retryPolicy?: RetryPolicy;
  metadata?: Record<string, unknown>;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  executionId?: string;
  scheduledFor: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  status: string;
  error?: string;
}

export interface ScheduleRunsResponse {
  runs: ScheduleRun[];
  count: number;
}
