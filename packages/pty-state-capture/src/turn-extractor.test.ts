import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SessionStateCapture } from './session-capture';
import { TurnExtractor } from './turn-extractor';

// Use a small normalized buffer so old content is pruned and
// classifyState's position-based recency logic works correctly
// across multiple feeds in a single test.
async function makeCapture(source?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'pty-turn-'));
  return new SessionStateCapture({
    sessionId: 'test',
    outputDir: dir,
    source,
    writeRawEvents: false,
    writeStates: false,
    writeTransitions: false,
    writeLifecycle: false,
    maxNormalizedBufferChars: 50,
  });
}

describe('TurnExtractor', () => {
  it('captures bootstrap turn (unknown → ready)', async () => {
    const capture = await makeCapture();
    const ext = new TurnExtractor();

    const r1 = await capture.feed('• Working (0s • esc to interrupt)');
    ext.push(r1, '• Working (0s • esc to interrupt)', 'stdout');

    const r2 = await capture.feed('› Ask Codex to do anything');
    const turn = ext.push(r2, '› Ask Codex to do anything', 'stdout');

    expect(turn).toBeDefined();
    expect(turn!.index).toBe(0);
    expect(turn!.input).toBe('');
    expect(turn!.finalState).toBe('ready_for_input');
    expect(turn!.transitions.length).toBeGreaterThan(0);
  });

  it('captures normal turn (stdin → busy → ready)', async () => {
    const capture = await makeCapture('codex');
    const ext = new TurnExtractor();

    // Bootstrap: busy → ready (matches real-world flow)
    const b1 = await capture.feed('• Working (0s • esc to interrupt)');
    ext.push(b1, '• Working (0s • esc to interrupt)', 'stdout');
    const b2 = await capture.feed('› Ask Codex to do anything');
    ext.push(b2, '› Ask Codex to do anything', 'stdout');

    // User types input
    const r2 = await capture.feed('fix the bug', 'stdin');
    ext.push(r2, 'fix the bug', 'stdin');

    // Busy
    const r3 = await capture.feed('• Working (2s • esc to interrupt)');
    ext.push(r3, '• Working (2s • esc to interrupt)', 'stdout');

    // Back to ready
    const r4 = await capture.feed('› Ask Codex to do anything');
    const turn = ext.push(r4, '› Ask Codex to do anything', 'stdout');

    expect(turn).toBeDefined();
    expect(turn!.index).toBe(1);
    expect(turn!.input).toBe('fix the bug');
    expect(turn!.finalState).toBe('ready_for_input');
  });

  it('captures approval turn (busy → awaiting_approval)', async () => {
    const capture = await makeCapture('codex');
    const ext = new TurnExtractor();

    // Bootstrap: busy → ready
    const b1 = await capture.feed('• Working (0s • esc to interrupt)');
    ext.push(b1, '• Working (0s • esc to interrupt)', 'stdout');
    const b2 = await capture.feed('› Ask Codex to do anything');
    ext.push(b2, '› Ask Codex to do anything', 'stdout');

    // Busy
    const r2 = await capture.feed('• Working (2s • esc to interrupt)');
    ext.push(r2, '• Working (2s • esc to interrupt)', 'stdout');

    // Approval prompt (matches awaiting_approval_codex pattern)
    const r3 = await capture.feed(
      'Would you like to run the following command?'
    );
    const turn = ext.push(
      r3,
      'Would you like to run the following command?',
      'stdout'
    );

    expect(turn).toBeDefined();
    expect(turn!.finalState).toBe('awaiting_approval');
  });

  it('handles multiple turns in sequence', async () => {
    const capture = await makeCapture('codex');
    const ext = new TurnExtractor();

    // Bootstrap: busy → ready
    const b1 = await capture.feed('• Working (0s • esc to interrupt)');
    ext.push(b1, '• Working (0s • esc to interrupt)', 'stdout');
    const b2 = await capture.feed('› Ask Codex to do anything');
    ext.push(b2, '› Ask Codex to do anything', 'stdout');

    // Turn 1
    const r2 = await capture.feed('• Working (2s • esc to interrupt)');
    ext.push(r2, '• Working (2s • esc to interrupt)', 'stdout');
    const r3 = await capture.feed('› Ask Codex to do anything');
    ext.push(r3, '› Ask Codex to do anything', 'stdout');

    // Turn 2
    const r4 = await capture.feed('• Working (5s • esc to interrupt)');
    ext.push(r4, '• Working (5s • esc to interrupt)', 'stdout');
    const r5 = await capture.feed('› Ask Codex to do anything');
    ext.push(r5, '› Ask Codex to do anything', 'stdout');

    const turns = ext.getCompletedTurns();
    expect(turns.length).toBe(3); // bootstrap + 2 turns
    expect(turns[0].index).toBe(0);
    expect(turns[1].index).toBe(1);
    expect(turns[2].index).toBe(2);
  });

  it('does not create spurious turns for idle-to-idle transitions', async () => {
    const capture = await makeCapture('codex');
    const ext = new TurnExtractor();

    // Bootstrap: busy → ready
    const b1 = await capture.feed('• Working (0s • esc to interrupt)');
    ext.push(b1, '• Working (0s • esc to interrupt)', 'stdout');
    const b2 = await capture.feed('› Ask Codex to do anything');
    ext.push(b2, '› Ask Codex to do anything', 'stdout');

    // Feed more ready-like output while already ready — should not create turns
    const r2 = await capture.feed('› Ask Codex to do anything');
    const turn = ext.push(r2, '› Ask Codex to do anything', 'stdout');
    expect(turn).toBeUndefined();

    expect(ext.getCompletedTurns().length).toBe(1); // just bootstrap
  });

  it('exposes in-progress turn via getCurrentTurn()', async () => {
    const capture = await makeCapture('codex');
    const ext = new TurnExtractor();

    // Bootstrap: busy → ready
    const b1 = await capture.feed('• Working (0s • esc to interrupt)');
    ext.push(b1, '• Working (0s • esc to interrupt)', 'stdout');
    const b2 = await capture.feed('› Ask Codex to do anything');
    ext.push(b2, '› Ask Codex to do anything', 'stdout');

    // Start a turn that doesn't finish
    const r2 = await capture.feed('• Working (2s • esc to interrupt)');
    ext.push(r2, '• Working (2s • esc to interrupt)', 'stdout');

    const current = ext.getCurrentTurn();
    expect(current).not.toBeNull();
    expect(current!.index).toBe(1);
    expect(current!.finalState).toBe('busy_streaming');
  });

  it('truncates output from front when exceeding limits', async () => {
    const capture = await makeCapture('codex');
    const ext = new TurnExtractor({
      maxRawOutputPerTurn: 50,
      maxCleanOutputPerTurn: 30,
    });

    // Bootstrap: busy → ready
    const b1 = await capture.feed('• Working (0s • esc to interrupt)');
    ext.push(b1, '• Working (0s • esc to interrupt)', 'stdout');
    const b2 = await capture.feed('› Ask Codex to do anything');
    ext.push(b2, '› Ask Codex to do anything', 'stdout');

    // Start a turn with lots of output
    const longOutput = 'x'.repeat(100);
    const r2 = await capture.feed(longOutput);
    ext.push(r2, longOutput, 'stdout');

    const current = ext.getCurrentTurn();
    expect(current).not.toBeNull();
    expect(current!.rawOutput!.length).toBeLessThanOrEqual(50);
    expect(current!.cleanOutput!.length).toBeLessThanOrEqual(30);
  });
});
