import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { SessionStateCapture } from './session-capture';
import { TurnExtractor } from './turn-extractor';
import type {
  FeedOutputResult,
  SessionCaptureOptions,
  SessionTranscript,
  StreamDirection,
  TranscriptBuilderOptions,
  Turn,
} from './types';

export class TranscriptBuilder {
  private readonly extractor: TurnExtractor;
  private readonly sessionId: string;
  private readonly source?: string;
  private capture: SessionStateCapture | null = null;
  private startedAt: string | null = null;
  private lastTs: string | null = null;
  private totalTransitions = 0;

  constructor(options: TranscriptBuilderOptions) {
    this.sessionId = options.sessionId;
    this.source = options.source;
    this.extractor = new TurnExtractor({
      idleStates: options.idleStates,
      maxRawOutputPerTurn: options.maxRawOutputPerTurn,
      maxCleanOutputPerTurn: options.maxCleanOutputPerTurn,
    });
  }

  attachCapture(capture: SessionStateCapture): void {
    this.capture = capture;
  }

  async feedThrough(
    chunk: string,
    direction: StreamDirection = 'stdout'
  ): Promise<Turn | undefined> {
    if (!this.capture) {
      throw new Error('No capture attached. Call attachCapture() first.');
    }
    const result = await this.capture.feed(chunk, direction);
    return this.pushResult(result, chunk, direction);
  }

  pushResult(
    result: FeedOutputResult,
    chunk: string,
    direction: StreamDirection
  ): Turn | undefined {
    const ts = result.state.ts;
    if (!this.startedAt) this.startedAt = ts;
    this.lastTs = ts;
    if (result.transition) this.totalTransitions += 1;
    return this.extractor.push(result, chunk, direction);
  }

  toTranscript(): SessionTranscript {
    const turns = this.extractor.getCompletedTurns();
    const now = new Date().toISOString();
    const startedAt = this.startedAt ?? now;
    const endedAt = this.lastTs ?? now;
    const finalTurn = turns[turns.length - 1];

    return {
      sessionId: this.sessionId,
      source: this.source,
      startedAt,
      endedAt,
      totalDurationMs:
        new Date(endedAt).getTime() - new Date(startedAt).getTime(),
      turns,
      finalState: finalTurn?.finalState ?? 'unknown',
      totalTransitions: this.totalTransitions,
    };
  }
}

interface RawEventRow {
  sessionId: string;
  direction: StreamDirection;
  bytesBase64: string;
}

export async function buildTranscriptFromJsonl(
  rawEventsPath: string,
  captureOptions: SessionCaptureOptions,
  transcriptOptions?: Partial<TranscriptBuilderOptions>
): Promise<SessionTranscript> {
  const text = await readFile(rawEventsPath, 'utf8');
  const lines = text.split('\n').filter(Boolean);

  // Replay with writes disabled
  const capture = new SessionStateCapture({
    ...captureOptions,
    writeRawEvents: false,
    writeStates: false,
    writeTransitions: false,
    writeLifecycle: false,
  });

  const builder = new TranscriptBuilder({
    sessionId: captureOptions.sessionId,
    source: captureOptions.source,
    ...transcriptOptions,
  });
  builder.attachCapture(capture);

  for (const line of lines) {
    const parsed = JSON.parse(line) as RawEventRow;
    const chunk = Buffer.from(parsed.bytesBase64, 'base64').toString('utf8');
    await builder.feedThrough(chunk, parsed.direction);
  }

  return builder.toTranscript();
}
