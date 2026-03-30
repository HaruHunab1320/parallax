export { PTYStateCaptureManager } from './capture-manager';
export { normalizeForMatching, stripAnsiPreserveText } from './normalize';
export { replayRawJsonl, replayTurns } from './replay';
export { SessionStateCapture } from './session-capture';
export { diffTranscripts, jaccardSimilarity } from './session-diff';
export { classifyState, DEFAULT_STATE_RULES, mergeRules } from './state-rules';
export {
  buildTranscriptFromJsonl,
  TranscriptBuilder,
} from './transcript-builder';
export { TurnExtractor } from './turn-extractor';
export type {
  CaptureLifecycleEvent,
  CaptureLifecycleRecord,
  CapturePaths,
  CaptureRawEvent,
  ClassifiedState,
  FeedOutputResult,
  FrameSnapshot,
  IdleStateKind,
  RegressionSeverity,
  SessionCaptureOptions,
  SessionCaptureSnapshot,
  SessionDiffResult,
  SessionTranscript,
  StateKind,
  StateRule,
  StateTransition,
  StreamDirection,
  TranscriptBuilderOptions,
  Turn,
  TurnComparison,
  TurnTiming,
  VTFrameOptions,
} from './types';
export { VTFrame } from './vt-frame';
