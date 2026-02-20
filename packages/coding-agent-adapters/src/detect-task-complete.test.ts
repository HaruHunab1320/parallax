import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from './claude-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { CodexAdapter } from './codex-adapter';
import { AiderAdapter } from './aider-adapter';

// ─────────────────────────────────────────────────────────────────────────────
// Claude Code - detectTaskComplete
// ─────────────────────────────────────────────────────────────────────────────

describe('ClaudeAdapter.detectTaskComplete', () => {
  const adapter = new ClaudeAdapter();

  it('detects turn duration + idle prompt', () => {
    const output = 'Some response text\nCooked for 3m 12s\n❯ ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects custom verb duration + idle prompt', () => {
    const output = 'Code generated\nVibed for 1m 6s\n❯ ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects hours-format duration', () => {
    const output = 'Done\nCooked for 1h 23m 45s\n❯ ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects seconds-only duration', () => {
    const output = 'Finished\nCooked for 8s\n❯ ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects idle prompt with shortcuts hint', () => {
    const output = 'for shortcuts\n❯ ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('rejects duration without idle prompt', () => {
    const output = 'Cooked for 3m 12s\nSome more output...';
    expect(adapter.detectTaskComplete(output)).toBe(false);
  });

  it('detects duration + idle prompt with trailing status bar', () => {
    // Real Claude TUI: status bar renders after the ❯ prompt
    const output = 'Response done\n✻ Churned for 50s   ❯   2 files +0 -0 · PR #48  Update available!';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects duration + idle prompt with trailing update notice', () => {
    const output = 'Done\nCooked for 3m 12s\n❯  2 files +0 -0\nUpdate available!';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects shortcuts hint + idle prompt with trailing status bar', () => {
    const output = 'for shortcuts\n❯   2 files +0 -0 · PR #48';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('rejects idle prompt without duration or shortcuts', () => {
    const output = 'Some text\n❯ ';
    expect(adapter.detectTaskComplete(output)).toBe(false);
  });

  it('detects turn duration through raw ANSI + spinner TUI output', () => {
    // Simulates real Claude TUI output with ANSI cursor positioning,
    // spinner characters, and box-drawing mixed in with text
    const output = '\x1b[2J\x1b[H⠋ Processing\x1b[5C\x1b[2K' +
      '✻\x1b[3C Churned for 46s\x1b[10C\x1b[K' +
      '\x1b[2;1H│\x1b[5Cstatus bar text\x1b[K' +
      '\x1b[3;1H❯\x1b[2C';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects "Baked for" through ANSI-garbled output', () => {
    const output = '\x1b[1;1H\x1b[2K⠙ Working...\x1b[K\r\n' +
      '✻ Baked for 2m 30s\x1b[20C\r\n' +
      '❯\x1b[3C 2 files +0 -0';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('rejects active loading output', () => {
    const output = 'Reading 5 files…';
    expect(adapter.detectTaskComplete(output)).toBe(false);
  });

  it('rejects empty output', () => {
    expect(adapter.detectTaskComplete('')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gemini CLI - detectTaskComplete
// ─────────────────────────────────────────────────────────────────────────────

describe('GeminiAdapter.detectTaskComplete', () => {
  const adapter = new GeminiAdapter();

  it('detects "◇ Ready" window title signal', () => {
    const output = 'Some response\n◇ Ready\n';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects "Type your message" composer placeholder', () => {
    const output = 'Response complete\nType your message...';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects case-insensitive "type your message"', () => {
    const output = 'Done\ntype your message';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('rejects active loading output', () => {
    const output = 'Generating witty retort… (esc to cancel, 5s)';
    expect(adapter.detectTaskComplete(output)).toBe(false);
  });

  it('rejects waiting for user confirmation', () => {
    const output = 'Waiting for user confirmation...';
    expect(adapter.detectTaskComplete(output)).toBe(false);
  });

  it('rejects empty output', () => {
    expect(adapter.detectTaskComplete('')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Codex CLI - detectTaskComplete
// ─────────────────────────────────────────────────────────────────────────────

describe('CodexAdapter.detectTaskComplete', () => {
  const adapter = new CodexAdapter();

  it('detects "Worked for" + ready prompt', () => {
    const output = 'Worked for 1m 05s\n› Ask Codex to do anything';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects ready prompt alone', () => {
    const output = 'Some response\n› Ask Codex to do anything';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects "Worked for" hours format + prompt', () => {
    const output = 'Worked for 2h 15m 30s\n› something';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects "Worked for" seconds only + prompt', () => {
    const output = 'Worked for 45s\n› prompt';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('rejects active working status', () => {
    const output = '• Working (5s • esc to interrupt)';
    expect(adapter.detectTaskComplete(output)).toBe(false);
  });

  it('rejects "Worked for" without any prompt', () => {
    const output = 'Worked for 1m 05s\nmore output here';
    expect(adapter.detectTaskComplete(output)).toBe(false);
  });

  it('rejects empty output', () => {
    expect(adapter.detectTaskComplete('')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Aider - detectTaskComplete
// ─────────────────────────────────────────────────────────────────────────────

describe('AiderAdapter.detectTaskComplete', () => {
  const adapter = new AiderAdapter();

  it('detects "Aider is waiting for your input"', () => {
    const output = 'Some response\nAider is waiting for your input';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects mode prompt with edit markers', () => {
    const output = 'Applied edit to src/main.ts\nTokens: 1234\ncode> ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects mode prompt with commit hash', () => {
    const output = 'Commit abc1234\ncode> ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects mode prompt with token usage', () => {
    const output = 'Some output\nTokens: 5678 sent\nCost: $0.01\narchitect> ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects ask prompt with edit markers', () => {
    const output = 'Updated file.py\nask> ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects plain > prompt with edit markers', () => {
    // Aider shows plain > in some modes
    const output = 'Applied edit to src/main.ts\nTokens: 1234\n> ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('detects plain > prompt with commit hash', () => {
    const output = 'Commit abc1234\n> ';
    expect(adapter.detectTaskComplete(output)).toBe(true);
  });

  it('rejects bare mode prompt without work indicators', () => {
    // Bare prompt could be startup, not task completion
    const output = 'code> ';
    expect(adapter.detectTaskComplete(output)).toBe(false);
  });

  it('rejects active waiting output', () => {
    const output = 'Waiting for claude-sonnet-4-20250514';
    expect(adapter.detectTaskComplete(output)).toBe(false);
  });

  it('rejects empty output', () => {
    expect(adapter.detectTaskComplete('')).toBe(false);
  });
});
