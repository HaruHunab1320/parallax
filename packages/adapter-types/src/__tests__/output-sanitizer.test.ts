import { describe, it, expect } from 'vitest';
import { sanitizeOutput } from '../output-sanitizer.js';

describe('sanitizeOutput', () => {
  describe('ANSI escape code stripping', () => {
    it('strips SGR color codes', () => {
      const input = '\x1b[32mHello\x1b[0m \x1b[1;31mWorld\x1b[0m';
      expect(sanitizeOutput(input)).toBe('Hello World');
    });

    it('strips cursor movement codes and replaces with spaces', () => {
      const input = 'Hello\x1b[5CWorld';
      const result = sanitizeOutput(input);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('strips cursor position codes (H and f)', () => {
      const input = 'before\x1b[10;20Hafter';
      const result = sanitizeOutput(input);
      expect(result).toContain('before');
      expect(result).toContain('after');
    });

    it('strips erase codes (J and K)', () => {
      const input = 'text\x1b[2Jmore';
      const result = sanitizeOutput(input);
      expect(result).toContain('text');
      expect(result).toContain('more');
    });

    it('strips bare control characters except tab and newline', () => {
      const input = 'Hello\x01\x02\x03World';
      expect(sanitizeOutput(input)).toBe('HelloWorld');
    });

    it('preserves tabs and newlines', () => {
      const input = 'Hello\tWorld\nNext line';
      expect(sanitizeOutput(input)).toBe('Hello\tWorld\nNext line');
    });
  });

  describe('JSON-escaped ANSI stripping', () => {
    it('strips JSON-escaped ANSI codes (\\u001b style)', () => {
      const input = '\\u001b[32mGreen text\\u001b[0m';
      expect(sanitizeOutput(input)).toBe('Green text');
    });

    it('strips JSON-escaped ANSI codes with multiple params', () => {
      const input = '\\u001b[1;31;42mStyled\\u001b[0m';
      expect(sanitizeOutput(input)).toBe('Styled');
    });
  });

  describe('TUI box-drawing character removal', () => {
    it('strips box-drawing characters', () => {
      const input = '╭──────╮\n│ Text │\n╰──────╯';
      const result = sanitizeOutput(input);
      expect(result).toContain('Text');
      expect(result).not.toContain('╭');
      expect(result).not.toContain('│');
      expect(result).not.toContain('╰');
    });

    it('strips spinner characters', () => {
      const input = '⠋ Loading...';
      const result = sanitizeOutput(input);
      expect(result).toContain('Loading...');
      expect(result).not.toContain('⠋');
    });

    it('normalizes non-breaking spaces', () => {
      const input = 'Hello\xa0World';
      expect(sanitizeOutput(input)).toBe('Hello World');
    });

    it('collapses multiple spaces from stripped characters', () => {
      const input = '│  lots   of   space  │';
      const result = sanitizeOutput(input);
      // Box chars become spaces, then multiple spaces collapse
      expect(result).not.toMatch(/ {2,}/);
    });
  });

  describe('OSC/DCS sequence removal', () => {
    it('strips OSC sequences terminated with BEL', () => {
      const input = 'before\x1b]0;Window Title\x07after';
      expect(sanitizeOutput(input)).toBe('beforeafter');
    });

    it('strips OSC sequences terminated with ST', () => {
      const input = 'before\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\after';
      expect(sanitizeOutput(input)).toBe('beforelinkafter');
    });

    it('strips DCS sequences', () => {
      const input = 'before\x1bPsome device control\x1b\\after';
      expect(sanitizeOutput(input)).toBe('beforeafter');
    });
  });

  describe('blank line collapsing', () => {
    it('collapses 3+ blank lines to 2', () => {
      const input = 'Line 1\n\n\n\n\nLine 2';
      expect(sanitizeOutput(input)).toBe('Line 1\n\nLine 2');
    });

    it('preserves exactly 2 blank lines (double newline)', () => {
      const input = 'Line 1\n\nLine 2';
      expect(sanitizeOutput(input)).toBe('Line 1\n\nLine 2');
    });

    it('preserves single newlines', () => {
      const input = 'Line 1\nLine 2';
      expect(sanitizeOutput(input)).toBe('Line 1\nLine 2');
    });
  });

  describe('maxLength truncation', () => {
    it('truncates from the start, keeping the END', () => {
      const input = 'ABCDEFGHIJ';
      expect(sanitizeOutput(input, { maxLength: 5 })).toBe('FGHIJ');
    });

    it('does not truncate when within limit', () => {
      const input = 'Short';
      expect(sanitizeOutput(input, { maxLength: 100 })).toBe('Short');
    });

    it('does not truncate when maxLength is 0', () => {
      const input = 'A'.repeat(10000);
      expect(sanitizeOutput(input, { maxLength: 0 })).toBe('A'.repeat(10000));
    });
  });

  describe('individual option disabling', () => {
    it('preserves ANSI codes when stripAnsi is false', () => {
      const input = '\x1b[32mGreen\x1b[0m';
      const result = sanitizeOutput(input, { stripAnsi: false });
      expect(result).toContain('\x1b[32m');
    });

    it('preserves TUI characters when stripTuiChrome is false', () => {
      const input = '│ Text │';
      const result = sanitizeOutput(input, { stripTuiChrome: false });
      expect(result).toContain('│');
    });

    it('preserves OSC sequences when stripOsc is false', () => {
      const input = '\x1b]0;Title\x07Text';
      // With stripAnsi also disabled, the full OSC sequence is preserved
      const result = sanitizeOutput(input, { stripOsc: false, stripAnsi: false });
      expect(result).toContain('\x1b]0;Title\x07');
    });

    it('preserves multiple blank lines when collapseBlankLines is false', () => {
      const input = 'A\n\n\n\n\nB';
      const result = sanitizeOutput(input, { collapseBlankLines: false });
      expect(result).toBe('A\n\n\n\n\nB');
    });
  });

  describe('empty/null input handling', () => {
    it('handles empty string', () => {
      expect(sanitizeOutput('')).toBe('');
    });

    it('handles whitespace-only string', () => {
      expect(sanitizeOutput('   \n\n   ')).toBe('');
    });

    it('handles string with only ANSI codes', () => {
      expect(sanitizeOutput('\x1b[32m\x1b[0m')).toBe('');
    });
  });

  describe('preserves meaningful content', () => {
    it('preserves code content after stripping terminal noise', () => {
      const input =
        '\x1b[32m✓\x1b[0m File saved: \x1b[1msrc/index.ts\x1b[0m\n' +
        '  const x = 42;\n' +
        '  return x + 1;\n';
      const result = sanitizeOutput(input);
      expect(result).toContain('File saved:');
      expect(result).toContain('src/index.ts');
      expect(result).toContain('const x = 42;');
      expect(result).toContain('return x + 1;');
    });

    it('preserves error messages after stripping', () => {
      const input = '\x1b[31mError:\x1b[0m Cannot find module \x1b[33m"foo"\x1b[0m';
      const result = sanitizeOutput(input);
      expect(result).toBe('Error: Cannot find module "foo"');
    });

    it('handles mixed terminal output realistically', () => {
      const input = [
        '\x1b]0;node app.js\x07',
        '\x1b[32m⠋\x1b[0m Compiling...',
        '\x1b[32m✓\x1b[0m Done in 2.3s',
        '',
        '',
        '',
        '',
        'Output: success',
      ].join('\n');
      const result = sanitizeOutput(input);
      expect(result).toContain('Compiling...');
      expect(result).toContain('Done in 2.3s');
      expect(result).toContain('Output: success');
      // Blank lines should be collapsed
      expect(result).not.toMatch(/\n{3,}/);
    });
  });
});
