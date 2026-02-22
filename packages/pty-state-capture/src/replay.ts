import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { SessionStateCapture } from './session-capture';
import type { SessionCaptureOptions, SessionCaptureSnapshot } from './types';

interface RawEventRow {
  sessionId: string;
  direction: 'stdout' | 'stderr' | 'stdin';
  bytesBase64: string;
}

export async function replayRawJsonl(
  rawEventsPath: string,
  options: SessionCaptureOptions,
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
