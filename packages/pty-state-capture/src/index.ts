export { VTFrame } from './vt-frame';
export { stripAnsiPreserveText, normalizeForMatching } from './normalize';
export { DEFAULT_STATE_RULES, mergeRules, classifyState } from './state-rules';
export { SessionStateCapture } from './session-capture';
export { PTYStateCaptureManager } from './capture-manager';
export { replayRawJsonl } from './replay';

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
} from './types';
