import { describe, expect, it } from 'vitest';
import { normalizeForMatching, stripAnsiPreserveText } from './normalize';

describe('normalize', () => {
  it('preserves visible text between ansi segments', () => {
    const raw = '\x1b[38;2;215;119;87m✻\x1b[39m \x1b[38;2;255;255;255mDone.\x1b[39m';
    const out = stripAnsiPreserveText(raw);
    expect(out).toContain('✻');
    expect(out).toContain('Done.');
  });

  it('replaces cursor-forward with spaces before collapsing', () => {
    const raw = 'A\x1b[3CB';
    const out = stripAnsiPreserveText(raw);
    expect(out).toBe('A   B');
    expect(normalizeForMatching(raw)).toBe('A B');
  });
});
