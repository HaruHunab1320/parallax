/**
 * Hermes Adapter Tests
 */

import { describe, it, expect } from 'vitest';
import { HermesAdapter } from '../src/hermes-adapter';
import type { SpawnConfig } from 'pty-manager';

describe('HermesAdapter', () => {
  const adapter = new HermesAdapter();

  describe('basic properties', () => {
    it('should have correct adapter type', () => {
      expect(adapter.adapterType).toBe('hermes');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Hermes Agent');
    });

    it('should use TUI menus by default', () => {
      expect(adapter.usesTuiMenus).toBe(true);
    });
  });

  describe('command/args/env', () => {
    it('should return hermes command', () => {
      expect(adapter.getCommand()).toBe('hermes');
    });

    it('should force chat mode args', () => {
      const args = adapter.getArgs({ name: 'test', type: 'hermes' });
      expect(args).toEqual(['chat']);
    });

    it('should map openaiKey into OPENROUTER_API_KEY', () => {
      const env = adapter.getEnv({
        name: 'test',
        type: 'hermes',
        adapterConfig: { openaiKey: 'sk-test' },
      } as SpawnConfig);

      expect(env.OPENROUTER_API_KEY).toBe('sk-test');
      expect(env.OPENAI_API_KEY).toBe('sk-test');
    });

    it('should set HERMES_QUIET when not interactive', () => {
      const env = adapter.getEnv({ name: 'test', type: 'hermes' });
      expect(env.HERMES_QUIET).toBe('1');
    });

    it('should not set HERMES_QUIET in interactive mode', () => {
      const env = adapter.getEnv({
        name: 'test',
        type: 'hermes',
        adapterConfig: { interactive: true },
      } as SpawnConfig);
      expect(env.HERMES_QUIET).toBeUndefined();
    });
  });

  describe('detectLogin()', () => {
    it('should detect first-run setup gate', () => {
      const result = adapter.detectLogin("Hermes isn't configured yet -- no API keys or providers found.");
      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect setup prompt question', () => {
      const result = adapter.detectLogin('Run setup now? [Y/n]');
      expect(result.required).toBe(true);
    });

    it('should return not required for normal output', () => {
      const result = adapter.detectLogin('Welcome to Hermes Agent');
      expect(result.required).toBe(false);
    });
  });

  describe('detectBlockingPrompt()', () => {
    it('should detect clarify panel', () => {
      const result = adapter.detectBlockingPrompt('╭─ Hermes needs your input ─╮\nOther (type your answer)');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('tool_wait');
      expect(result.canAutoRespond).toBe(false);
    });

    it('should detect sudo panel', () => {
      const result = adapter.detectBlockingPrompt('🔐 Sudo Password Required');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('tool_wait');
    });

    it('should detect dangerous command approval panel', () => {
      const result = adapter.detectBlockingPrompt('⚠️  Dangerous Command\nAllow once\nDeny');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
    });
  });

  describe('detectLoading()', () => {
    it('should detect thinking spinner with verb and timer', () => {
      const output = '(⌐■_■) deliberating... (2.4s)';
      expect(adapter.detectLoading(output)).toBe(true);
    });

    it('should detect active working prompt', () => {
      expect(adapter.detectLoading('⚕ ❯ ')).toBe(true);
    });

    it('should not detect loading for idle prompt', () => {
      expect(adapter.detectLoading('❯ ')).toBe(false);
    });
  });

  describe('ready/task complete detection', () => {
    it('should detect ready on idle prompt', () => {
      expect(adapter.detectReady('\n❯ ')).toBe(true);
    });

    it('should reject ready when clarify panel is active', () => {
      const output = 'Hermes needs your input\n? ❯ ';
      expect(adapter.detectReady(output)).toBe(false);
    });

    it('should detect task complete from Hermes response box', () => {
      const output = '╭─ ⚕ Hermes ─╮\nfinal answer\n\n╰─────────────╯';
      expect(adapter.detectTaskComplete(output)).toBe(true);
    });

    it('should detect task complete from idle prompt + tool feed', () => {
      const output = '┊ 💻 $ ls -la  0.1s\n❯ ';
      expect(adapter.detectTaskComplete(output)).toBe(true);
    });
  });

  describe('parseOutput()', () => {
    it('should parse content from response box', () => {
      const output = '╭─ ⚕ Hermes ─╮\nHello from Hermes\n\n╰─────────────╯';
      const parsed = adapter.parseOutput(output);

      expect(parsed).not.toBeNull();
      expect(parsed?.isComplete).toBe(true);
      expect(parsed?.content).toContain('Hello from Hermes');
    });

    it('should return null for incomplete output', () => {
      const parsed = adapter.parseOutput('still working...');
      expect(parsed).toBeNull();
    });
  });
});
