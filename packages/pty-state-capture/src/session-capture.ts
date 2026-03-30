import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { writeJsonLine } from './jsonl-writer';
import { normalizeForMatching } from './normalize';
import { classifyState, mergeRules } from './state-rules';
import type {
  CaptureLifecycleEvent,
  CaptureLifecycleRecord,
  CapturePaths,
  CaptureRawEvent,
  ClassifiedState,
  FeedOutputResult,
  SessionCaptureOptions,
  SessionCaptureSnapshot,
  StateKind,
  StateTransition,
  StreamDirection,
} from './types';
import { VTFrame } from './vt-frame';

export class SessionStateCapture {
  private readonly options: Required<
    Pick<
      SessionCaptureOptions,
      | 'writeRawEvents'
      | 'writeStates'
      | 'writeTransitions'
      | 'writeLifecycle'
      | 'maxNormalizedBufferChars'
    >
  >;

  private readonly frame: VTFrame;
  private readonly rules;
  private normalizedBuffer = '';
  private currentState: ClassifiedState;
  private transitionCount = 0;
  private feedQueue: Promise<void> = Promise.resolve();
  private geminiReadySignalCount = 0;
  private geminiPendingState: {
    kind: StateKind;
    ruleId?: string;
    count: number;
  } | null = null;
  private lastUnknownChunk = '';

  public readonly paths: CapturePaths;

  constructor(private readonly config: SessionCaptureOptions) {
    this.options = {
      writeRawEvents: config.writeRawEvents ?? true,
      writeStates: config.writeStates ?? true,
      writeTransitions: config.writeTransitions ?? true,
      writeLifecycle: config.writeLifecycle ?? true,
      maxNormalizedBufferChars: config.maxNormalizedBufferChars ?? 20000,
    };

    this.paths = {
      rootDir: config.outputDir,
      rawEventsPath: join(
        config.outputDir,
        `${config.sessionId}.raw-events.jsonl`
      ),
      statesPath: join(config.outputDir, `${config.sessionId}.states.jsonl`),
      transitionsPath: join(
        config.outputDir,
        `${config.sessionId}.transitions.jsonl`
      ),
      lifecyclePath: join(
        config.outputDir,
        `${config.sessionId}.lifecycle.jsonl`
      ),
    };

    this.frame = new VTFrame({
      rows: config.rows,
      cols: config.cols,
      maxLines: config.maxLines,
    });

    this.rules = mergeRules(config.stateRules);
    this.currentState = {
      ts: new Date().toISOString(),
      sessionId: config.sessionId,
      state: 'unknown',
      confidence: 0,
      normalizedTail: '',
    };
  }

  async recordLifecycle(
    event: CaptureLifecycleEvent,
    detail?: string
  ): Promise<void> {
    if (!this.options.writeLifecycle) return;

    const row: CaptureLifecycleRecord = {
      ts: new Date().toISOString(),
      sessionId: this.config.sessionId,
      event,
      detail,
    };
    await writeJsonLine(this.paths.lifecyclePath, row);
  }

  async feed(
    chunk: string,
    direction: StreamDirection = 'stdout'
  ): Promise<FeedOutputResult> {
    const run = this.feedQueue.then(
      () => this.feedInternal(chunk, direction),
      () => this.feedInternal(chunk, direction)
    );
    this.feedQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async feedInternal(
    chunk: string,
    direction: StreamDirection = 'stdout'
  ): Promise<FeedOutputResult> {
    const now = new Date().toISOString();

    if (this.options.writeRawEvents) {
      const rawEvent: CaptureRawEvent = {
        ts: now,
        sessionId: this.config.sessionId,
        direction,
        bytesBase64: Buffer.from(chunk, 'utf8').toString('base64'),
        textPreview: chunk.slice(0, 140),
      };
      await writeJsonLine(this.paths.rawEventsPath, rawEvent);
    }

    const normalizedChunk = normalizeForMatching(chunk);
    const shouldClassify = direction === 'stdout' && normalizedChunk.length > 0;

    if (direction !== 'stdin') {
      this.frame.applyChunk(chunk);
    }

    if (!shouldClassify) {
      return {
        stateChanged: false,
        state: this.currentState,
        transition: undefined,
        frame: this.frame.snapshot(),
        normalizedChunk,
      };
    }

    this.appendNormalized(normalizedChunk);

    const classified = classifyState(
      this.normalizedBuffer,
      this.rules,
      this.config.source
    );
    const stabilized = this.applyGeminiReadyHysteresis(classified);
    const debounced = this.applyGeminiTransitionDebounce(stabilized);
    const nextState: ClassifiedState = {
      ts: now,
      sessionId: this.config.sessionId,
      state: debounced.kind,
      ruleId: debounced.ruleId,
      confidence: debounced.confidence,
      normalizedTail: this.normalizedBuffer,
    };

    const stateChanged = this.currentState.state !== nextState.state;
    let transition: StateTransition | undefined;

    if (stateChanged) {
      transition = {
        ts: now,
        sessionId: this.config.sessionId,
        from: this.currentState.state,
        to: nextState.state,
        ruleId: nextState.ruleId,
      };
      this.transitionCount += 1;
      if (this.options.writeTransitions) {
        await writeJsonLine(this.paths.transitionsPath, transition);
      }
    }

    this.currentState = nextState;

    const skipRepeatedUnknownStateWrite =
      !stateChanged &&
      nextState.state === 'unknown' &&
      normalizedChunk.length > 0 &&
      normalizedChunk === this.lastUnknownChunk;

    if (this.options.writeStates && !skipRepeatedUnknownStateWrite) {
      await writeJsonLine(this.paths.statesPath, nextState);
    }

    if (nextState.state === 'unknown') {
      this.lastUnknownChunk = normalizedChunk;
    } else {
      this.lastUnknownChunk = '';
    }

    return {
      stateChanged,
      state: nextState,
      transition,
      frame: this.frame.snapshot(),
      normalizedChunk,
    };
  }

  snapshot(): SessionCaptureSnapshot {
    return {
      sessionId: this.config.sessionId,
      paths: this.paths,
      frame: this.frame.snapshot(),
      normalizedTail: this.normalizedBuffer,
      state: this.currentState,
      transitions: this.transitionCount,
    };
  }

  getCurrentState(): StateKind {
    return this.currentState.state;
  }

  private appendNormalized(text: string): void {
    if (!text) return;
    const merged = `${this.normalizedBuffer} ${text}`.trim();
    const max = this.options.maxNormalizedBufferChars;
    this.normalizedBuffer = merged.length > max ? merged.slice(-max) : merged;
  }

  private applyGeminiReadyHysteresis(classified: {
    kind: StateKind;
    ruleId?: string;
    confidence: number;
  }): { kind: StateKind; ruleId?: string; confidence: number } {
    if (this.config.source !== 'gemini') {
      return classified;
    }

    const current = this.currentState.state;
    const currentIsActive =
      current === 'busy_streaming' ||
      current === 'awaiting_input' ||
      current === 'awaiting_approval' ||
      current === 'awaiting_auth';

    if (classified.kind !== 'ready_for_input') {
      this.geminiReadySignalCount = 0;
      return classified;
    }

    // Explicit cancel -> composer frame should restore ready immediately.
    if (classified.ruleId === 'ready_prompt_gemini_after_cancel') {
      this.geminiReadySignalCount = 0;
      return classified;
    }

    // Gemini's TUI often paints the ready composer while still showing active
    // overlays in adjacent redraw frames. Require repeated ready matches
    // before transitioning from active -> ready.
    if (currentIsActive) {
      this.geminiReadySignalCount += 1;
      if (this.geminiReadySignalCount < 3) {
        return {
          kind: current,
          ruleId: this.currentState.ruleId,
          confidence: Math.min(classified.confidence, 0.7),
        };
      }
      this.geminiReadySignalCount = 0;
    } else {
      this.geminiReadySignalCount = 0;
    }

    return classified;
  }

  private applyGeminiTransitionDebounce(classified: {
    kind: StateKind;
    ruleId?: string;
    confidence: number;
  }): { kind: StateKind; ruleId?: string; confidence: number } {
    if (this.config.source !== 'gemini') {
      return classified;
    }

    const current = this.currentState.state;
    if (classified.kind === current) {
      this.geminiPendingState = null;
      return classified;
    }

    const currentIsReady = current === 'ready_for_input';
    const classifiedIsActive =
      classified.kind === 'busy_streaming' ||
      classified.kind === 'awaiting_input' ||
      classified.kind === 'awaiting_approval' ||
      classified.kind === 'awaiting_auth';

    const threshold = currentIsReady && classifiedIsActive ? 2 : 1;
    if (threshold <= 1) {
      this.geminiPendingState = null;
      return classified;
    }

    if (
      this.geminiPendingState &&
      this.geminiPendingState.kind === classified.kind &&
      this.geminiPendingState.ruleId === classified.ruleId
    ) {
      this.geminiPendingState.count += 1;
    } else {
      this.geminiPendingState = {
        kind: classified.kind,
        ruleId: classified.ruleId,
        count: 1,
      };
    }

    if (this.geminiPendingState.count < threshold) {
      return {
        kind: current,
        ruleId: this.currentState.ruleId,
        confidence: Math.min(classified.confidence, 0.72),
      };
    }

    this.geminiPendingState = null;
    return classified;
  }
}
