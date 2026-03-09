import { describe, expect, it } from 'vitest';
import { stripAnsi, cleanForChat, extractCompletionSummary, extractDevServerUrl } from './ansi-utils';

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[32mgreen text\x1b[0m')).toBe('green text');
  });

  it('replaces cursor-forward codes with spaces', () => {
    expect(stripAnsi('hello\x1b[5Cworld')).toBe('hello world');
  });

  it('removes OSC sequences', () => {
    expect(stripAnsi('\x1b]0;window title\x07real content')).toBe('real content');
  });

  it('handles empty input', () => {
    expect(stripAnsi('')).toBe('');
  });
});

describe('cleanForChat', () => {
  it('strips ANSI and TUI decorative characters', () => {
    const result = cleanForChat('│ \x1b[32mHello World\x1b[0m │');
    expect(result).toContain('Hello World');
    expect(result).not.toContain('│');
  });

  it('removes loading/thinking lines', () => {
    const input = 'thinking...\nActual output here\nBrewing...\nMore content';
    const result = cleanForChat(input);
    expect(result).toContain('Actual output here');
    expect(result).toContain('More content');
    expect(result).not.toContain('thinking');
    expect(result).not.toContain('Brewing');
  });

  it('removes status bar lines', () => {
    const input = 'Real content\n↓ 3.2k tokens\nesc to interrupt\nMore content';
    const result = cleanForChat(input);
    expect(result).toContain('Real content');
    expect(result).toContain('More content');
    expect(result).not.toContain('esc to interrupt');
  });

  it('collapses consecutive blank lines', () => {
    const input = 'Line 1\n\n\n\n\nLine 2';
    const result = cleanForChat(input);
    expect(result).toBe('Line 1\nLine 2');
  });

  it('removes lines with only punctuation/symbols', () => {
    const input = 'Content\n────────\nMore content';
    const result = cleanForChat(input);
    expect(result).toBe('Content\nMore content');
  });

  it('handles empty input', () => {
    expect(cleanForChat('')).toBe('');
  });
});

describe('extractCompletionSummary', () => {
  it('extracts PR URLs', () => {
    const input = 'Created PR at https://github.com/org/repo/pull/42 done';
    expect(extractCompletionSummary(input)).toContain('https://github.com/org/repo/pull/42');
  });

  it('extracts commit hashes', () => {
    const input = 'committed abc1234def';
    expect(extractCompletionSummary(input)).toContain('committed abc1234def');
  });

  it('extracts diff stats', () => {
    const input = '3 files changed, 15 insertions(+), 2 deletions(-)';
    expect(extractCompletionSummary(input)).toContain('3 files changed');
  });

  it('returns empty for no artifacts', () => {
    expect(extractCompletionSummary('just some output')).toBe('');
  });
});

describe('extractDevServerUrl', () => {
  it('extracts localhost URLs', () => {
    expect(extractDevServerUrl('Server running at http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('extracts 127.0.0.1 URLs', () => {
    expect(extractDevServerUrl('→ http://127.0.0.1:8080/api')).toBe('http://127.0.0.1:8080/api');
  });

  it('returns null when no URL found', () => {
    expect(extractDevServerUrl('no server here')).toBeNull();
  });
});
