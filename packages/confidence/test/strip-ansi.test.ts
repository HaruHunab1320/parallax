import { describe, expect, it } from 'vitest';
import { parseConfidenceMarker, stripAnsi } from '../src';

describe('stripAnsi', () => {
  it('removes CSI sequences including private-mode params', () => {
    expect(stripAnsi('\x1b[38;2;225;139;107mFermenting…\x1b[39m')).toBe(
      'Fermenting…'
    );
    expect(stripAnsi('\x1b[?2026h\x1b[?25ldone\x1b[?25h\x1b[?2026l')).toBe(
      'done'
    );
  });

  it('removes OSC window-title sequences', () => {
    expect(stripAnsi('\x1b]0;✳ Build CSV tool\x07hello')).toBe('hello');
  });

  it('removes carriage returns but keeps newlines', () => {
    expect(stripAnsi('line1\r\nline2\r')).toBe('line1\nline2');
  });

  it('passes plain text through unchanged', () => {
    expect(stripAnsi('CONFIDENCE: 0.9')).toBe('CONFIDENCE: 0.9');
    expect(stripAnsi('')).toBe('');
  });
});

describe('parseConfidenceMarker on raw PTY frames', () => {
  it('parses a marker wrapped in rendering sequences', () => {
    const raw =
      '\x1b[?2026h\x1b[H\x1b[38;2;153;153;153mdone.\x1b[39m\n' +
      '\x1b[3GCONFIDENCE:\x1b[15G 0.85\x1b[K\x1b[?2026l';
    expect(parseConfidenceMarker(raw)).toBe(0.85);
  });

  it('parses a marker split by cursor positioning', () => {
    const raw = 'CONFIDENCE:\x1b[2C0.7';
    expect(parseConfidenceMarker(raw)).toBe(0.7);
  });

  it('still takes the last marker after stripping', () => {
    const raw =
      'End with CONFIDENCE: 0.0 as instructed…\n\x1b[1mCONFIDENCE: 0.9\x1b[22m';
    expect(parseConfidenceMarker(raw)).toBe(0.9);
  });
});
