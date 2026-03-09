export type StreamDirection = 'stdout' | 'stderr' | 'stdin';

export type CaptureLifecycleEvent =
  | 'session_started'
  | 'session_ready'
  | 'session_stopped'
  | 'session_error';

export type StateKind =
  | 'unknown'
  | 'busy_streaming'
  | 'awaiting_input'
  | 'awaiting_auth'
  | 'awaiting_approval'
  | 'ready_for_input'
  | 'completed';

export interface StateRule {
  id: string;
  kind: StateKind;
  pattern: RegExp;
  priority?: number;
  source?: string;
}

export interface CaptureRawEvent {
  ts: string;
  sessionId: string;
  direction: StreamDirection;
  bytesBase64: string;
  textPreview?: string;
}

export interface CaptureLifecycleRecord {
  ts: string;
  sessionId: string;
  event: CaptureLifecycleEvent;
  detail?: string;
}

export interface FrameSnapshot {
  rows: number;
  cols: number;
  altScreen: boolean;
  cursorRow: number;
  cursorCol: number;
  lines: string[];
  visibleText: string;
}

export interface ClassifiedState {
  ts: string;
  sessionId: string;
  state: StateKind;
  ruleId?: string;
  confidence: number;
  normalizedTail: string;
}

export interface StateTransition {
  ts: string;
  sessionId: string;
  from: StateKind;
  to: StateKind;
  ruleId?: string;
}

export interface CapturePaths {
  rootDir: string;
  rawEventsPath: string;
  statesPath: string;
  transitionsPath: string;
  lifecyclePath: string;
}

export interface VTFrameOptions {
  rows?: number;
  cols?: number;
  maxLines?: number;
}

export interface SessionCaptureOptions extends VTFrameOptions {
  sessionId: string;
  outputDir: string;
  source?: string;
  stateRules?: StateRule[];
  writeRawEvents?: boolean;
  writeStates?: boolean;
  writeTransitions?: boolean;
  writeLifecycle?: boolean;
  maxNormalizedBufferChars?: number;
}

export interface SessionCaptureSnapshot {
  sessionId: string;
  paths: CapturePaths;
  frame: FrameSnapshot;
  normalizedTail: string;
  state: ClassifiedState;
  transitions: number;
}

export interface FeedOutputResult {
  stateChanged: boolean;
  state: ClassifiedState;
  transition?: StateTransition;
  frame: FrameSnapshot;
  normalizedChunk: string;
}

// ── Session Replay & Regression Detection ──────────────────────────

export type IdleStateKind =
  | 'ready_for_input'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'awaiting_auth'
  | 'completed';

export interface TurnTiming {
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface Turn {
  index: number;
  timing: TurnTiming;
  input: string;
  rawOutput: string;
  cleanOutput: string;
  transitions: StateTransition[];
  finalState: StateKind;
  eventCount: number;
}

export interface SessionTranscript {
  sessionId: string;
  source?: string;
  startedAt: string;
  endedAt: string;
  totalDurationMs: number;
  turns: Turn[];
  finalState: StateKind;
  totalTransitions: number;
}

export interface TranscriptBuilderOptions {
  sessionId: string;
  source?: string;
  idleStates?: IdleStateKind[];
  maxRawOutputPerTurn?: number;
  maxCleanOutputPerTurn?: number;
}

export interface TurnComparison {
  baselineTurnIndex: number | null;
  candidateTurnIndex: number | null;
  outputSimilarity: number;
  durationDeltaMs: number;
  finalStateMatch: boolean;
  candidateStuck: boolean;
}

export type RegressionSeverity = 'none' | 'info' | 'warning' | 'regression';

export interface SessionDiffResult {
  severity: RegressionSeverity;
  score: number;
  summary: string;
  flags: string[];
  turnComparisons: TurnComparison[];
}
