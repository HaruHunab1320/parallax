import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionStateCapture } from './session-capture';
import type { CaptureLifecycleEvent, FeedOutputResult, SessionCaptureOptions, SessionCaptureSnapshot, StreamDirection } from './types';

export interface CaptureManagerOptions {
  outputRootDir: string;
  defaultRows?: number;
  defaultCols?: number;
  maxLines?: number;
  maxNormalizedBufferChars?: number;
}

export class PTYStateCaptureManager {
  private captures = new Map<string, SessionStateCapture>();

  constructor(private readonly options: CaptureManagerOptions) {}

  async openSession(sessionId: string, overrides: Partial<SessionCaptureOptions> = {}): Promise<SessionStateCapture> {
    if (this.captures.has(sessionId)) {
      return this.captures.get(sessionId)!;
    }

    await mkdir(this.options.outputRootDir, { recursive: true });

    const config: SessionCaptureOptions = {
      sessionId,
      outputDir: join(this.options.outputRootDir, sessionId),
      rows: overrides.rows ?? this.options.defaultRows,
      cols: overrides.cols ?? this.options.defaultCols,
      maxLines: overrides.maxLines ?? this.options.maxLines,
      stateRules: overrides.stateRules,
      writeRawEvents: overrides.writeRawEvents,
      writeStates: overrides.writeStates,
      writeTransitions: overrides.writeTransitions,
      writeLifecycle: overrides.writeLifecycle,
      maxNormalizedBufferChars:
        overrides.maxNormalizedBufferChars ?? this.options.maxNormalizedBufferChars,
    };

    const capture = new SessionStateCapture(config);
    this.captures.set(sessionId, capture);
    await capture.recordLifecycle('session_started');
    return capture;
  }

  async feed(sessionId: string, chunk: string, direction: StreamDirection = 'stdout'): Promise<FeedOutputResult> {
    const capture = await this.openSession(sessionId);
    return capture.feed(chunk, direction);
  }

  async lifecycle(sessionId: string, event: CaptureLifecycleEvent, detail?: string): Promise<void> {
    const capture = await this.openSession(sessionId);
    await capture.recordLifecycle(event, detail);
  }

  snapshot(sessionId: string): SessionCaptureSnapshot | null {
    const capture = this.captures.get(sessionId);
    return capture ? capture.snapshot() : null;
  }

  listSessions(): string[] {
    return [...this.captures.keys()];
  }
}
