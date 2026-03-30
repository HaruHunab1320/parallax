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

    const readyLikeGemini = await capture.feed(
      'Type your message or @path/to/file'
    );
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

    const awaitingInput = await capture.feed(
      'Interrupted · What should Claude do instead?'
    );
    expect(awaitingInput.state.state).toBe('awaiting_input');
    expect(awaitingInput.state.ruleId).toBe(
      'awaiting_input_claude_interrupted'
    );

    const awaitingApproval = await capture.feed(
      "Do you want to proceed? 1. Yes 2. Yes, and don't ask again"
    );
    expect(awaitingApproval.state.state).toBe('awaiting_approval');
    expect(awaitingApproval.state.ruleId).toBe('awaiting_approval_claude_menu');

    const busy = await capture.feed(
      '⏸ plan mode on (shift+tab to exit) · Finagling… (5m 33s · ↓ 14.5k tokens)'
    );
    expect(busy.state.state).toBe('busy_streaming');
    expect(busy.state.ruleId).toBe('busy_plan_mode_claude');

    const ready = await capture.feed(
      '❯ Try "refactor eliza.ts" ? for shortcuts'
    );
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

    const transitionsRaw = await readFile(
      capture.paths.transitionsPath,
      'utf8'
    );
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

  it('ignores stdin and control-only chunks for state classification', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's6',
      outputDir: dir,
      source: 'codex',
    });

    const startupControl = await capture.feed(
      '\x1b[?2004h\x1b[>7u\x1b[6n',
      'stdout'
    );
    expect(startupControl.stateChanged).toBe(false);
    expect(startupControl.state.state).toBe('unknown');

    const stdinNoise = await capture.feed('\x1b[32;1:3u', 'stdin');
    expect(stdinNoise.stateChanged).toBe(false);
    expect(stdinNoise.state.state).toBe('unknown');

    const ready = await capture.feed('› Ask Codex to do anything', 'stdout');
    expect(ready.state.state).toBe('ready_for_input');
    expect(ready.stateChanged).toBe(true);

    const stdinAfterReady = await capture.feed('fix auth flow', 'stdin');
    expect(stdinAfterReady.state.state).toBe('ready_for_input');
    expect(stdinAfterReady.stateChanged).toBe(false);
  });

  it('prefers gemini non-ready states when ready prompt coexists with active overlays', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's7',
      outputDir: dir,
      source: 'gemini',
    });

    const awaitingApproval = await capture.feed(
      'Apply this change? Waiting for user confirmation... > Type your message or @path/to/file'
    );
    expect(awaitingApproval.state.state).toBe('awaiting_approval');
    expect(awaitingApproval.state.ruleId).toBe('awaiting_approval_gemini');

    const awaitingInput = await capture.feed(
      'Do you want to continue (Y/n)? Interactive shell awaiting input... press tab to focus shell > Type your message or @path/to/file'
    );
    expect(awaitingInput.state.state).toBe('awaiting_input');
    expect([
      'awaiting_input_shell_confirm_gemini',
      'awaiting_input_shell_wait',
    ]).toContain(awaitingInput.state.ruleId);
  });

  it('applies gemini ready hysteresis to reduce flicker-induced flapping', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's8',
      outputDir: dir,
      source: 'gemini',
      maxNormalizedBufferChars: 140,
    });

    // Enter an active state first.
    const busy = await capture.feed(
      'Optimizing for ludicrous speed (esc to cancel, 2s)'
    );
    expect(busy.state.state).toBe('busy_streaming');

    const readyFrame = `${'x'.repeat(240)} > Type your message or @path/to/file`;

    // First two ready-like frames should be suppressed by hysteresis.
    const ready1 = await capture.feed(readyFrame);
    expect(ready1.state.state).toBe('busy_streaming');

    const ready2 = await capture.feed(readyFrame);
    expect(ready2.state.state).toBe('busy_streaming');

    // Third consecutive ready signal is accepted.
    const ready3 = await capture.feed(readyFrame);
    expect(ready3.state.state).toBe('ready_for_input');
    expect(ready3.state.ruleId).toBe('ready_prompt_gemini');
  });

  it('debounces gemini ready->active single-frame flicker transitions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's9',
      outputDir: dir,
      source: 'gemini',
      maxNormalizedBufferChars: 140,
    });

    // Start in ready state.
    const ready = await capture.feed('> Type your message or @path/to/file');
    expect(ready.state.state).toBe('ready_for_input');

    // First active-like frame should be suppressed.
    const active1 = await capture.feed('Loading... (esc to cancel, 2s)');
    expect(active1.state.state).toBe('ready_for_input');

    // Second consecutive active frame should transition.
    const active2 = await capture.feed('Loading... (esc to cancel, 2s)');
    expect(active2.state.state).toBe('busy_streaming');
  });

  it('maps gemini cancelled+composer frames back to ready_for_input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's10',
      outputDir: dir,
      source: 'gemini',
      maxNormalizedBufferChars: 240,
    });

    await capture.feed('Doing work... (esc to cancel, 5s)');
    const cancelled = await capture.feed(
      'Request cancelled. Press Ctrl+C again to exit. > Type your message or @path/to/file'
    );
    expect(cancelled.state.state).toBe('ready_for_input');
    expect(cancelled.state.ruleId).toBe('ready_prompt_gemini_after_cancel');
  });

  it('prefers busy_streaming for gemini mixed frames containing esc-to-cancel + composer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pty-capture-'));
    const capture = new SessionStateCapture({
      sessionId: 's11',
      outputDir: dir,
      source: 'gemini',
      maxNormalizedBufferChars: 260,
    });

    const mixed = await capture.feed(
      'Doing research... (esc to cancel, 6m 8s) ? for shortcuts > Type your message or @path/to/file'
    );
    expect(mixed.state.state).toBe('busy_streaming');
    expect(mixed.state.ruleId).toBe('busy_status_line');
  });
});
