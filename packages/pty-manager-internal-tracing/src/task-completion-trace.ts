/**
 * Task completion trace analysis helpers.
 *
 * Parses structured "Task completion trace" logs and builds a compact
 * per-turn confidence timeline useful for debugging idle/completion detection.
 */

export interface TaskCompletionTraceRecord {
  sessionId?: string;
  adapterType?: string;
  event: string;
  status?: string;
  taskCompletePending?: boolean;
  signal?: boolean;
  wasPending?: boolean;
  debounceMs?: number;
  detectTaskComplete?: boolean;
  detectReady?: boolean;
  detectLoading?: boolean;
  tailHash?: string;
  tailSnippet?: string;
  timestamp?: string | number | Date;
}

export interface TaskCompletionTimelineStep {
  event: string;
  atIndex: number;
  status: 'active' | 'active_loading' | 'likely_complete' | 'completed' | 'rejected';
  confidence: number;
  signal?: boolean;
  detectTaskComplete?: boolean;
  detectReady?: boolean;
  detectLoading?: boolean;
}

export interface TaskCompletionTurnTimeline {
  turn: number;
  startIndex: number;
  endIndex: number;
  completed: boolean;
  maxConfidence: number;
  finalConfidence: number;
  events: TaskCompletionTimelineStep[];
}

export interface TaskCompletionTimelineResult {
  turns: TaskCompletionTurnTimeline[];
  totalRecords: number;
  ignoredRecords: number;
}

export interface BuildTimelineOptions {
  adapterType?: string;
}

/**
 * Extract trace records from mixed log inputs.
 * Accepts structured objects and JSON lines.
 */
export function extractTaskCompletionTraceRecords(
  entries: Array<string | Record<string, unknown>>,
): TaskCompletionTraceRecord[] {
  const out: TaskCompletionTraceRecord[] = [];

  for (const entry of entries) {
    let obj: Record<string, unknown> | null = null;

    if (typeof entry === 'string') {
      const line = entry.trim();
      if (!line.startsWith('{') || !line.endsWith('}')) continue;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
    } else if (entry && typeof entry === 'object') {
      obj = entry;
    }

    if (!obj) continue;
    if (obj.msg !== 'Task completion trace') continue;
    if (typeof obj.event !== 'string') continue;

    out.push({
      sessionId: asString(obj.sessionId),
      adapterType: asString(obj.adapterType),
      event: obj.event,
      status: asString(obj.status),
      taskCompletePending: asBool(obj.taskCompletePending),
      signal: asBool(obj.signal),
      wasPending: asBool(obj.wasPending),
      debounceMs: asNumber(obj.debounceMs),
      detectTaskComplete: asBool(obj.detectTaskComplete),
      detectReady: asBool(obj.detectReady),
      detectLoading: asBool(obj.detectLoading),
      tailHash: asString(obj.tailHash),
      tailSnippet: asString(obj.tailSnippet),
      timestamp: asTimestamp(obj.time) ?? asTimestamp(obj.timestamp),
    });
  }

  return out;
}

/**
 * Build a per-turn confidence timeline from task-completion traces.
 */
export function buildTaskCompletionTimeline(
  records: TaskCompletionTraceRecord[],
  options: BuildTimelineOptions = {},
): TaskCompletionTimelineResult {
  const filtered = records.filter((r) => {
    if (!options.adapterType) return true;
    return r.adapterType === options.adapterType;
  });

  const turns: TaskCompletionTurnTimeline[] = [];
  let current: TaskCompletionTurnTimeline | null = null;
  let ignored = 0;

  filtered.forEach((record, index) => {
    if (record.event === 'busy_signal' && current && current.completed) {
      current = null;
    }

    if (!current) {
      current = {
        turn: turns.length + 1,
        startIndex: index,
        endIndex: index,
        completed: false,
        maxConfidence: 0,
        finalConfidence: 0,
        events: [],
      };
      turns.push(current);
    }

    const step = toStep(record, index);
    if (!step) {
      ignored++;
      return;
    }

    current.events.push(step);
    current.endIndex = index;
    current.maxConfidence = Math.max(current.maxConfidence, step.confidence);
    current.finalConfidence = step.confidence;

    if (step.status === 'completed') {
      current.completed = true;
    }
  });

  return {
    turns,
    totalRecords: filtered.length,
    ignoredRecords: ignored,
  };
}

function toStep(record: TaskCompletionTraceRecord, atIndex: number): TaskCompletionTimelineStep | null {
  const event = record.event;
  const confidence = scoreConfidence(record);

  if (event === 'transition_ready') {
    return withCommon(record, {
      event,
      atIndex,
      status: 'completed',
      confidence: 100,
    });
  }

  if (event === 'debounce_reject_signal' || event === 'debounce_reject_status') {
    return withCommon(record, {
      event,
      atIndex,
      status: 'rejected',
      confidence,
    });
  }

  if (record.detectLoading) {
    return withCommon(record, {
      event,
      atIndex,
      status: 'active_loading',
      confidence,
    });
  }

  if (event === 'debounce_fire' && record.signal) {
    return withCommon(record, {
      event,
      atIndex,
      status: 'likely_complete',
      confidence,
    });
  }

  if (
    event === 'busy_signal' ||
    event === 'debounce_schedule' ||
    event === 'debounce_fire'
  ) {
    return withCommon(record, {
      event,
      atIndex,
      status: 'active',
      confidence,
    });
  }

  return null;
}

function scoreConfidence(record: TaskCompletionTraceRecord): number {
  let score = 10;

  if (record.detectLoading) score -= 40;
  if (record.detectReady) score += 20;
  if (record.detectTaskComplete) score += 45;
  if (record.signal) score += 20;
  if (record.event === 'debounce_reject_signal' || record.event === 'debounce_reject_status') {
    score -= 30;
  }
  if (record.event === 'transition_ready') score = 100;

  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
}

function withCommon(
  record: TaskCompletionTraceRecord,
  step: Omit<TaskCompletionTimelineStep, 'signal' | 'detectTaskComplete' | 'detectReady' | 'detectLoading'>,
): TaskCompletionTimelineStep {
  return {
    ...step,
    signal: record.signal,
    detectTaskComplete: record.detectTaskComplete,
    detectReady: record.detectReady,
    detectLoading: record.detectLoading,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asTimestamp(value: unknown): string | number | Date | undefined {
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    return value;
  }
  return undefined;
}

