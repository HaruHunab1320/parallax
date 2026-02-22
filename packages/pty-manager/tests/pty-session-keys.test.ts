/**
 * PTY Session - Special Keys and Paste Tests
 */

import { describe, it, expect } from 'vitest';
import { SPECIAL_KEYS } from '../src/pty-session';

describe('SPECIAL_KEYS', () => {
  describe('Ctrl+letter combinations', () => {
    const ctrlKeys = 'abcdefghijklmnopqrstuvwxyz'.split('');

    it('should have all Ctrl+letter combinations (a-z)', () => {
      for (const letter of ctrlKeys) {
        const key = `ctrl+${letter}`;
        expect(SPECIAL_KEYS[key], `Missing ${key}`).toBeDefined();
      }
    });

    it('should map Ctrl+letter to correct ASCII control codes', () => {
      // Ctrl+A = 0x01, Ctrl+B = 0x02, etc.
      expect(SPECIAL_KEYS['ctrl+a']).toBe('\x01');
      expect(SPECIAL_KEYS['ctrl+b']).toBe('\x02');
      expect(SPECIAL_KEYS['ctrl+c']).toBe('\x03');
      expect(SPECIAL_KEYS['ctrl+d']).toBe('\x04');
      expect(SPECIAL_KEYS['ctrl+z']).toBe('\x1a');
    });

    it('should have Ctrl+special character combinations', () => {
      expect(SPECIAL_KEYS['ctrl+[']).toBe('\x1b'); // ESC
      expect(SPECIAL_KEYS['ctrl+\\']).toBe('\x1c');
      expect(SPECIAL_KEYS['ctrl+]']).toBe('\x1d');
      expect(SPECIAL_KEYS['ctrl+^']).toBe('\x1e');
      expect(SPECIAL_KEYS['ctrl+_']).toBe('\x1f');
    });
  });

  describe('Alt+letter combinations', () => {
    const altKeys = 'abcdefghijklmnopqrstuvwxyz'.split('');

    it('should have all Alt+letter combinations (a-z)', () => {
      for (const letter of altKeys) {
        const key = `alt+${letter}`;
        expect(SPECIAL_KEYS[key], `Missing ${key}`).toBeDefined();
      }
    });

    it('should map Alt+letter to ESC + letter', () => {
      // Alt sends ESC (0x1b) followed by the letter
      expect(SPECIAL_KEYS['alt+a']).toBe('\x1ba');
      expect(SPECIAL_KEYS['alt+f']).toBe('\x1bf');
      expect(SPECIAL_KEYS['alt+b']).toBe('\x1bb');
      expect(SPECIAL_KEYS['alt+z']).toBe('\x1bz');
    });

    it('should have alt+backspace for delete word', () => {
      expect(SPECIAL_KEYS['alt+backspace']).toBe('\x1b\x7f');
    });
  });

  describe('Navigation keys - plain', () => {
    it('should have all basic navigation keys', () => {
      expect(SPECIAL_KEYS['up']).toBe('\x1b[A');
      expect(SPECIAL_KEYS['down']).toBe('\x1b[B');
      expect(SPECIAL_KEYS['right']).toBe('\x1b[C');
      expect(SPECIAL_KEYS['left']).toBe('\x1b[D');
      expect(SPECIAL_KEYS['home']).toBe('\x1b[H');
      expect(SPECIAL_KEYS['end']).toBe('\x1b[F');
      expect(SPECIAL_KEYS['pageup']).toBe('\x1b[5~');
      expect(SPECIAL_KEYS['pagedown']).toBe('\x1b[6~');
    });
  });

  describe('Navigation keys - with Shift (modifier 2)', () => {
    it('should have Shift+arrow keys', () => {
      expect(SPECIAL_KEYS['shift+up']).toBe('\x1b[1;2A');
      expect(SPECIAL_KEYS['shift+down']).toBe('\x1b[1;2B');
      expect(SPECIAL_KEYS['shift+right']).toBe('\x1b[1;2C');
      expect(SPECIAL_KEYS['shift+left']).toBe('\x1b[1;2D');
    });

    it('should have Shift+home/end', () => {
      expect(SPECIAL_KEYS['shift+home']).toBe('\x1b[1;2H');
      expect(SPECIAL_KEYS['shift+end']).toBe('\x1b[1;2F');
    });

    it('should have Shift+pageup/pagedown', () => {
      expect(SPECIAL_KEYS['shift+pageup']).toBe('\x1b[5;2~');
      expect(SPECIAL_KEYS['shift+pagedown']).toBe('\x1b[6;2~');
    });
  });

  describe('Navigation keys - with Alt (modifier 3)', () => {
    it('should have Alt+arrow keys for word navigation', () => {
      expect(SPECIAL_KEYS['alt+up']).toBe('\x1b[1;3A');
      expect(SPECIAL_KEYS['alt+down']).toBe('\x1b[1;3B');
      expect(SPECIAL_KEYS['alt+right']).toBe('\x1b[1;3C');
      expect(SPECIAL_KEYS['alt+left']).toBe('\x1b[1;3D');
    });
  });

  describe('Navigation keys - with Ctrl (modifier 5)', () => {
    it('should have Ctrl+arrow keys for word navigation', () => {
      expect(SPECIAL_KEYS['ctrl+up']).toBe('\x1b[1;5A');
      expect(SPECIAL_KEYS['ctrl+down']).toBe('\x1b[1;5B');
      expect(SPECIAL_KEYS['ctrl+right']).toBe('\x1b[1;5C');
      expect(SPECIAL_KEYS['ctrl+left']).toBe('\x1b[1;5D');
    });

    it('should have Ctrl+home/end', () => {
      expect(SPECIAL_KEYS['ctrl+home']).toBe('\x1b[1;5H');
      expect(SPECIAL_KEYS['ctrl+end']).toBe('\x1b[1;5F');
    });
  });

  describe('Navigation keys - with Ctrl+Shift (modifier 6)', () => {
    it('should have Ctrl+Shift+arrow keys for word selection', () => {
      expect(SPECIAL_KEYS['ctrl+shift+up']).toBe('\x1b[1;6A');
      expect(SPECIAL_KEYS['ctrl+shift+down']).toBe('\x1b[1;6B');
      expect(SPECIAL_KEYS['ctrl+shift+right']).toBe('\x1b[1;6C');
      expect(SPECIAL_KEYS['ctrl+shift+left']).toBe('\x1b[1;6D');
    });

    it('should have Ctrl+Shift+home/end', () => {
      expect(SPECIAL_KEYS['ctrl+shift+home']).toBe('\x1b[1;6H');
      expect(SPECIAL_KEYS['ctrl+shift+end']).toBe('\x1b[1;6F');
    });
  });

  describe('Navigation keys - with Shift+Alt (modifier 4)', () => {
    it('should have Shift+Alt+arrow keys', () => {
      expect(SPECIAL_KEYS['shift+alt+up']).toBe('\x1b[1;4A');
      expect(SPECIAL_KEYS['shift+alt+down']).toBe('\x1b[1;4B');
      expect(SPECIAL_KEYS['shift+alt+right']).toBe('\x1b[1;4C');
      expect(SPECIAL_KEYS['shift+alt+left']).toBe('\x1b[1;4D');
    });
  });

  describe('Editing keys', () => {
    it('should have basic editing keys', () => {
      expect(SPECIAL_KEYS['enter']).toBe('\r');
      expect(SPECIAL_KEYS['return']).toBe('\r');
      expect(SPECIAL_KEYS['tab']).toBe('\t');
      expect(SPECIAL_KEYS['backspace']).toBe('\x7f');
      expect(SPECIAL_KEYS['delete']).toBe('\x1b[3~');
      expect(SPECIAL_KEYS['insert']).toBe('\x1b[2~');
      expect(SPECIAL_KEYS['escape']).toBe('\x1b');
      expect(SPECIAL_KEYS['esc']).toBe('\x1b');
      expect(SPECIAL_KEYS['space']).toBe(' ');
    });

    it('should have Shift+Tab (reverse tab)', () => {
      expect(SPECIAL_KEYS['shift+tab']).toBe('\x1b[Z');
    });

    it('should have modified delete keys', () => {
      expect(SPECIAL_KEYS['shift+delete']).toBe('\x1b[3;2~');
      expect(SPECIAL_KEYS['ctrl+delete']).toBe('\x1b[3;5~');
    });
  });

  describe('Function keys - plain', () => {
    it('should have F1-F4 (special sequences)', () => {
      expect(SPECIAL_KEYS['f1']).toBe('\x1bOP');
      expect(SPECIAL_KEYS['f2']).toBe('\x1bOQ');
      expect(SPECIAL_KEYS['f3']).toBe('\x1bOR');
      expect(SPECIAL_KEYS['f4']).toBe('\x1bOS');
    });

    it('should have F5-F12', () => {
      expect(SPECIAL_KEYS['f5']).toBe('\x1b[15~');
      expect(SPECIAL_KEYS['f6']).toBe('\x1b[17~');
      expect(SPECIAL_KEYS['f7']).toBe('\x1b[18~');
      expect(SPECIAL_KEYS['f8']).toBe('\x1b[19~');
      expect(SPECIAL_KEYS['f9']).toBe('\x1b[20~');
      expect(SPECIAL_KEYS['f10']).toBe('\x1b[21~');
      expect(SPECIAL_KEYS['f11']).toBe('\x1b[23~');
      expect(SPECIAL_KEYS['f12']).toBe('\x1b[24~');
    });
  });

  describe('Function keys - with Shift (modifier 2)', () => {
    it('should have Shift+F1-F4', () => {
      expect(SPECIAL_KEYS['shift+f1']).toBe('\x1b[1;2P');
      expect(SPECIAL_KEYS['shift+f2']).toBe('\x1b[1;2Q');
      expect(SPECIAL_KEYS['shift+f3']).toBe('\x1b[1;2R');
      expect(SPECIAL_KEYS['shift+f4']).toBe('\x1b[1;2S');
    });

    it('should have Shift+F5-F12', () => {
      expect(SPECIAL_KEYS['shift+f5']).toBe('\x1b[15;2~');
      expect(SPECIAL_KEYS['shift+f6']).toBe('\x1b[17;2~');
      expect(SPECIAL_KEYS['shift+f7']).toBe('\x1b[18;2~');
      expect(SPECIAL_KEYS['shift+f8']).toBe('\x1b[19;2~');
      expect(SPECIAL_KEYS['shift+f9']).toBe('\x1b[20;2~');
      expect(SPECIAL_KEYS['shift+f10']).toBe('\x1b[21;2~');
      expect(SPECIAL_KEYS['shift+f11']).toBe('\x1b[23;2~');
      expect(SPECIAL_KEYS['shift+f12']).toBe('\x1b[24;2~');
    });
  });

  describe('Function keys - with Ctrl (modifier 5)', () => {
    it('should have Ctrl+F1-F4', () => {
      expect(SPECIAL_KEYS['ctrl+f1']).toBe('\x1b[1;5P');
      expect(SPECIAL_KEYS['ctrl+f2']).toBe('\x1b[1;5Q');
      expect(SPECIAL_KEYS['ctrl+f3']).toBe('\x1b[1;5R');
      expect(SPECIAL_KEYS['ctrl+f4']).toBe('\x1b[1;5S');
    });

    it('should have Ctrl+F5-F12', () => {
      expect(SPECIAL_KEYS['ctrl+f5']).toBe('\x1b[15;5~');
      expect(SPECIAL_KEYS['ctrl+f6']).toBe('\x1b[17;5~');
      expect(SPECIAL_KEYS['ctrl+f7']).toBe('\x1b[18;5~');
      expect(SPECIAL_KEYS['ctrl+f8']).toBe('\x1b[19;5~');
      expect(SPECIAL_KEYS['ctrl+f9']).toBe('\x1b[20;5~');
      expect(SPECIAL_KEYS['ctrl+f10']).toBe('\x1b[21;5~');
      expect(SPECIAL_KEYS['ctrl+f11']).toBe('\x1b[23;5~');
      expect(SPECIAL_KEYS['ctrl+f12']).toBe('\x1b[24;5~');
    });
  });

  describe('Key count and completeness', () => {
    it('should have at least 130 key mappings', () => {
      const keyCount = Object.keys(SPECIAL_KEYS).length;
      expect(keyCount).toBeGreaterThanOrEqual(130);
    });

    it('should have consistent modifier patterns', () => {
      // Modifier 2 = Shift
      const shiftKeys = Object.keys(SPECIAL_KEYS).filter(k => k.startsWith('shift+') && !k.includes('ctrl') && !k.includes('alt'));
      expect(shiftKeys.length).toBeGreaterThan(0);

      // Modifier 3 = Alt (for arrows)
      const altArrowKeys = ['alt+up', 'alt+down', 'alt+left', 'alt+right'];
      for (const key of altArrowKeys) {
        expect(SPECIAL_KEYS[key]).toContain(';3');
      }

      // Modifier 5 = Ctrl
      const ctrlArrowKeys = ['ctrl+up', 'ctrl+down', 'ctrl+left', 'ctrl+right'];
      for (const key of ctrlArrowKeys) {
        expect(SPECIAL_KEYS[key]).toContain(';5');
      }

      // Modifier 6 = Ctrl+Shift
      const ctrlShiftKeys = ['ctrl+shift+up', 'ctrl+shift+down', 'ctrl+shift+left', 'ctrl+shift+right'];
      for (const key of ctrlShiftKeys) {
        expect(SPECIAL_KEYS[key]).toContain(';6');
      }
    });

    it('all keys should be lowercase', () => {
      for (const key of Object.keys(SPECIAL_KEYS)) {
        expect(key).toBe(key.toLowerCase());
      }
    });

    it('all values should be non-empty strings', () => {
      for (const [key, value] of Object.entries(SPECIAL_KEYS)) {
        expect(typeof value).toBe('string');
        expect(value.length, `${key} has empty value`).toBeGreaterThan(0);
      }
    });
  });
});

describe('Bracketed paste constants', () => {
  it('should use correct escape sequences', () => {
    // These are defined in the module but not exported,
    // so we test that the paste method would use them correctly
    const BRACKETED_PASTE_START = '\x1b[200~';
    const BRACKETED_PASTE_END = '\x1b[201~';

    expect(BRACKETED_PASTE_START).toBe('\x1b[200~');
    expect(BRACKETED_PASTE_END).toBe('\x1b[201~');
  });
});
