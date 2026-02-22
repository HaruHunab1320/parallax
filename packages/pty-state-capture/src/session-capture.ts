import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { normalizeForMatching } from './normalize';
import { mergeRules, classifyState } from './state-rules';
import { VTFrame } from './vt-frame';
import { writeJsonLine } from './jsonl-writer';
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
      rawEventsPath: join(config.outputDir, `${config.sessionId}.raw-events.jsonl`),
      statesPath: join(config.outputDir, `${config.sessionId}.states.jsonl`),
      transitionsPath: join(config.outputDir, `${config.sessionId}.transitions.jsonl`),
      lifecyclePath: join(config.outputDir, `${config.sessionId}.lifecycle.jsonl`),
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

  async recordLifecycle(event: CaptureLifecycleEvent, detail?: string): Promise<void> {
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
    direction: StreamDirection = 'stdout',
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

    if (direction !== 'stdin') {
      this.frame.applyChunk(chunk);
    }

    const normalizedChunk = normalizeForMatching(chunk);
    this.appendNormalized(normalizedChunk);

    const classified = classifyState(this.normalizedBuffer, this.rules);
    const nextState: ClassifiedState = {
      ts: now,
      sessionId: this.config.sessionId,
      state: classified.kind,
      ruleId: classified.ruleId,
      confidence: classified.confidence,
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

    if (this.options.writeStates) {
      await writeJsonLine(this.paths.statesPath, nextState);
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
}
