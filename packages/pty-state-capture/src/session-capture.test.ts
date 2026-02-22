import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SessionStateCapture } from './session-capture';

describe('SessionStateCapture', () => {
  it('emits transitions and writes artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's1',
      outputDir: dir,
    });

    await capture.feed('• Working (0s • esc to interrupt)');
    const res = await capture.feed('› Ask Codex to do anything');

    expect(res.state.state).toBe('ready_for_input');
    expect(res.stateChanged).toBe(true);

    const states = await readFile(capture.paths.statesPath, 'utf8');
    const transitions = await readFile(capture.paths.transitionsPath, 'utf8');
    expect(states.length).toBeGreaterThan(0);
    expect(transitions.length).toBeGreaterThan(0);
  });

  it('scopes state rules by source to prevent cross-agent misclassification', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's2',
      outputDir: dir,
      source: 'claude',
    });

    const readyLikeGemini = await capture.feed('Type your message or @path/to/file');
    expect(readyLikeGemini.state.state).toBe('unknown');

    const approvalLikeGemini = await capture.feed('Do you want to proceed?');
    expect(approvalLikeGemini.state.state).toBe('unknown');
  });
});
