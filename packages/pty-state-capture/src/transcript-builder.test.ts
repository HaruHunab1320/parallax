import { Buffer } from 'node:buffer';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SessionStateCapture } from './session-capture';
import {
  buildTranscriptFromJsonl,
  TranscriptBuilder,
} from './transcript-builder';

function makeEvent(direction: string, text: string) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    sessionId: 'test',
    direction,
    bytesBase64: Buffer.from(text, 'utf8').toString('base64'),
  });
}

describe('TranscriptBuilder', () => {
  it('builds transcript in real-time mode with SessionStateCapture', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-tb-'));
    const capture = new SessionStateCapture({
      sessionId: 'rt1',
      outputDir: dir,
      writeRawEvents: false,
      writeStates: false,
      writeTransitions: false,
      writeLifecycle: false,
      maxNormalizedBufferChars: 50,
    });

    const builder = new TranscriptBuilder({ sessionId: 'rt1' });
    builder.attachCapture(capture);

    // Bootstrap: busy → ready
    await builder.feedThrough('• Working (0s • esc to interrupt)', 'stdout');
    await builder.feedThrough('› Ask Codex to do anything', 'stdout');

    // User input
    await builder.feedThrough('fix stuff', 'stdin');

    // Busy → ready
    await builder.feedThrough('• Working (2s • esc to interrupt)', 'stdout');
    await builder.feedThrough('› Ask Codex to do anything', 'stdout');

    const transcript = builder.toTranscript();
    expect(transcript.sessionId).toBe('rt1');
    expect(transcript.turns.length).toBe(2); // bootstrap + 1 turn
    expect(transcript.turns[0].index).toBe(0);
    expect(transcript.turns[1].index).toBe(1);
    expect(transcript.turns[1].input).toBe('fix stuff');
    expect(transcript.finalState).toBe('ready_for_input');
    expect(transcript.totalTransitions).toBeGreaterThan(0);
  });

  it('builds transcript from JSONL file (offline mode)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-tb-'));
    const jsonlPath = join(dir, 'test.raw-events.jsonl');

    const events = [
      makeEvent('stdout', '• Working (0s • esc to interrupt)'),
      makeEvent('stdout', '› Ask Codex to do anything'),
      makeEvent('stdin', 'do the thing'),
      makeEvent('stdout', '• Working (3s • esc to interrupt)'),
      makeEvent('stdout', '› Ask Codex to do anything'),
    ].join('\n');

    await writeFile(jsonlPath, events, 'utf8');

    const transcript = await buildTranscriptFromJsonl(jsonlPath, {
      sessionId: 'offline1',
      outputDir: dir,
      maxNormalizedBufferChars: 50,
    });

    expect(transcript.sessionId).toBe('offline1');
    expect(transcript.turns.length).toBe(2);
    expect(transcript.turns[1].input).toBe('do the thing');
  });

  it('does not write artifact files in offline mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-tb-'));
    const jsonlPath = join(dir, 'test.raw-events.jsonl');

    const events = [makeEvent('stdout', '› Ask Codex to do anything')].join(
      '\n'
    );

    await writeFile(jsonlPath, events, 'utf8');

    await buildTranscriptFromJsonl(jsonlPath, {
      sessionId: 'offline-no-write',
      outputDir: dir,
    });

    // Only the source JSONL should exist, no artifacts
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(dir);
    expect(files).toEqual(['test.raw-events.jsonl']);
  });

  it('handles empty session (zero turns)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-tb-'));
    const capture = new SessionStateCapture({
      sessionId: 'empty',
      outputDir: dir,
      writeRawEvents: false,
      writeStates: false,
      writeTransitions: false,
      writeLifecycle: false,
    });

    const builder = new TranscriptBuilder({ sessionId: 'empty' });
    builder.attachCapture(capture);

    // Feed only unknown-state output, never reaching idle
    await builder.feedThrough('some random output', 'stdout');

    const transcript = builder.toTranscript();
    expect(transcript.turns.length).toBe(0);
    expect(transcript.finalState).toBe('unknown');
  });
});
