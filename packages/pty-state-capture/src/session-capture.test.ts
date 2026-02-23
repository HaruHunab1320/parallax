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

  it('classifies claude-specific unknown patterns into explicit states', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's3',
      outputDir: dir,
      source: 'claude',
    });

    const awaitingInput = await capture.feed('Interrupted · What should Claude do instead?');
    expect(awaitingInput.state.state).toBe('awaiting_input');
    expect(awaitingInput.state.ruleId).toBe('awaiting_input_claude_interrupted');

    const awaitingApproval = await capture.feed('Do you want to proceed? 1. Yes 2. Yes, and don\'t ask again');
    expect(awaitingApproval.state.state).toBe('awaiting_approval');
    expect(awaitingApproval.state.ruleId).toBe('awaiting_approval_claude_menu');

    const busy = await capture.feed('⏸ plan mode on (shift+tab to exit) · Finagling… (5m 33s · ↓ 14.5k tokens)');
    expect(busy.state.state).toBe('busy_streaming');
    expect(busy.state.ruleId).toBe('busy_plan_mode_claude');

    const ready = await capture.feed('❯ Try "refactor eliza.ts" ? for shortcuts');
    expect(ready.state.state).toBe('ready_for_input');
    expect(ready.state.ruleId).toBe('ready_prompt_claude');
  });

  it('serializes concurrent feed calls to avoid duplicate transition spam', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's4',
      outputDir: dir,
      source: 'claude',
    });

    await Promise.all([
      capture.feed('⏸ plan mode on (shift+tab to cycle) · Esc to interrupt'),
      capture.feed('✻ Cooked for 41s'),
      capture.feed('❯ Try "fix lint errors" ? for shortcuts'),
    ]);

    const transitionsRaw = await readFile(capture.paths.transitionsPath, 'utf8');
    const transitions = transitionsRaw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { from: string; to: string });

    const uniquePairs = new Set(transitions.map((t) => `${t.from}->${t.to}`));
    expect(transitions.length).toBe(uniquePairs.size);
    expect(capture.getCurrentState()).toBe('ready_for_input');
  });

  it('does not keep classifying stale completion markers after newer output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's5',
      outputDir: dir,
      source: 'claude',
    });

    const completed = await capture.feed('✻ Cooked for 41s');
    expect(completed.state.state).toBe('completed');

    const stale = await capture.feed('x'.repeat(5000));
    expect(stale.state.state).toBe('unknown');
  });
});
