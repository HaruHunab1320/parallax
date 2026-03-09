export { VTFrame } from './vt-frame';
export { stripAnsiPreserveText, normalizeForMatching } from './normalize';
export { DEFAULT_STATE_RULES, mergeRules, classifyState } from './state-rules';
export { SessionStateCapture } from './session-capture';
export { PTYStateCaptureManager } from './capture-manager';
export { replayRawJsonl, replayTurns } from './replay';
export { TurnExtractor } from './turn-extractor';
export { TranscriptBuilder, buildTranscriptFromJsonl } from './transcript-builder';
export { diffTranscripts, jaccardSimilarity } from './session-diff';

export type {
  StreamDirection,
  CaptureLifecycleEvent,
  StateKind,
  StateRule,
  CaptureRawEvent,
  CaptureLifecycleRecord,
  FrameSnapshot,
  ClassifiedState,
  StateTransition,
  CapturePaths,
  VTFrameOptions,
  SessionCaptureOptions,
  SessionCaptureSnapshot,
  FeedOutputResult,
  IdleStateKind,
  TurnTiming,
  Turn,
  SessionTranscript,
  TranscriptBuilderOptions,
  TurnComparison,
  RegressionSeverity,
  SessionDiffResult,
} from './types';
