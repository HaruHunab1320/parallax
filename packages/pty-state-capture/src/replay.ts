import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { SessionStateCapture } from './session-capture';
import type { TurnExtractorOptions } from './turn-extractor';
import { TurnExtractor } from './turn-extractor';
import type {
  SessionCaptureOptions,
  SessionCaptureSnapshot,
  Turn,
} from './types';

interface RawEventRow {
  sessionId: string;
  direction: 'stdout' | 'stderr' | 'stdin';
  bytesBase64: string;
}

export async function replayRawJsonl(
  rawEventsPath: string,
  options: SessionCaptureOptions
): Promise<SessionCaptureSnapshot> {
  const text = await readFile(rawEventsPath, 'utf8');
  const capture = new SessionStateCapture(options);
  const lines = text.split('\n').filter(Boolean);

  for (const line of lines) {
    const parsed = JSON.parse(line) as RawEventRow;
    const chunk = Buffer.from(parsed.bytesBase64, 'base64').toString('utf8');
    await capture.feed(chunk, parsed.direction);
  }

  return capture.snapshot();
}

export async function* replayTurns(
  rawEventsPath: string,
  options: SessionCaptureOptions,
  turnOptions?: TurnExtractorOptions
): AsyncGenerator<Turn> {
  const text = await readFile(rawEventsPath, 'utf8');
  const capture = new SessionStateCapture({
    ...options,
    writeRawEvents: false,
    writeStates: false,
    writeTransitions: false,
    writeLifecycle: false,
  });
  const extractor = new TurnExtractor(turnOptions);
  const lines = text.split('\n').filter(Boolean);

  for (const line of lines) {
    const parsed = JSON.parse(line) as RawEventRow;
    const chunk = Buffer.from(parsed.bytesBase64, 'base64').toString('utf8');
    const result = await capture.feed(chunk, parsed.direction);
    const turn = extractor.push(result, chunk, parsed.direction);
    if (turn) yield turn;
  }
}
