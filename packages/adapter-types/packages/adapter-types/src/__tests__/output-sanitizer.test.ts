import { describe, expect, it } from 'vitest';
import { sanitizeOutput } from '../output-sanitizer';

describe('sanitizeOutput', () => {
  describe('ANSI stripping', () => {
    it('strips SGR color codes', () => {
      expect(sanitizeOutput('\x1b[32mgreen\x1b[0m text')).toBe('green text');
    });

    it('strips cursor movement codes', () => {
      expect(sanitizeOutput('hello\x1b[5Cworld')).toBe('hello world');
    });

    it('strips JSON-escaped ANSI sequences', () => {
      expect(sanitizeOutput('\\u001b[32mgreen\\u001b[0m')).toBe('green');
    });

    it('strips bare control characters except tab and newline', () => {
      expect(sanitizeOutput('hello\x07\x08world')).toBe('helloworld');
      expect(sanitizeOutput('line1\nline2')).toBe('line1\nline2');
    });
  });

  describe('TUI chrome stripping', () => {
    it('strips box-drawing characters', () => {
      expect(sanitizeOutput('╭──────╮\n│ text │\n╰──────╯')).toBe('text');
    });

    it('strips spinner characters', () => {
      expect(sanitizeOutput('⠋ Loading...')).toBe('Loading...');
    });

    it('collapses multiple spaces', () => {
      expect(sanitizeOutput('hello     world')).toBe('hello world');
    });
  });

  describe('OSC/DCS stripping', () => {
    it('strips OSC sequences', () => {
      expect(sanitizeOutput('\x1b]0;Window Title\x07visible')).toBe('visible');
    });

    it('strips DCS sequences', () => {
      expect(sanitizeOutput('\x1bP+q544e\x1b\\visible')).toBe('visible');
    });
  });

  describe('blank line collapsing', () => {
    it('collapses 3+ blank lines to 2', () => {
      expect(sanitizeOutput('a\n\n\n\nb')).toBe('a\n\nb');
    });

    it('preserves 1-2 blank lines', () => {
      expect(sanitizeOutput('a\nb')).toBe('a\nb');
      expect(sanitizeOutput('a\n\nb')).toBe('a\n\nb');
    });
  });

  describe('maxLength truncation', () => {
    it('truncates from the end', () => {
      expect(sanitizeOutput('abcdefghij', { maxLength: 5 })).toBe('fghij');
    });

    it('does not truncate when under limit', () => {
      expect(sanitizeOutput('short', { maxLength: 100 })).toBe('short');
    });

    it('does not truncate when maxLength is 0', () => {
      const long = 'a'.repeat(10000);
      expect(sanitizeOutput(long, { maxLength: 0 })).toBe(long);
    });
  });

  describe('options', () => {
    it('can disable ANSI stripping', () => {
      expect(sanitizeOutput('\x1b[32mgreen\x1b[0m', { stripAnsi: false })).toContain('\x1b[32m');
    });

    it('can disable TUI chrome stripping', () => {
      expect(sanitizeOutput('│ text │', { stripTuiChrome: false })).toContain('│');
    });

    it('can disable blank line collapsing', () => {
      expect(sanitizeOutput('a\n\n\n\nb', { collapseBlankLines: false })).toBe('a\n\n\n\nb');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(sanitizeOutput('')).toBe('');
    });

    it('handles ANSI-only input', () => {
      expect(sanitizeOutput('\x1b[32m\x1b[0m')).toBe('');
    });

    it('preserves meaningful content through all transformations', () => {
      const messy = '\x1b[32m╭──╮\n│ \x1b[1mCreate src/App.tsx\x1b[0m │\n╰──╯\n\n\n\nDone.';
      const clean = sanitizeOutput(messy);
      expect(clean).toContain('Create src/App.tsx');
      expect(clean).toContain('Done.');
      expect(clean).not.toContain('\x1b');
    });
  });
});
