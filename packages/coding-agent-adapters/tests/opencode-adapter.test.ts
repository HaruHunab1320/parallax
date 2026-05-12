/**
 * OpenCode Adapter Tests
 */

import type { SpawnConfig } from 'pty-manager';
import { describe, expect, it } from 'vitest';
import { OpencodeAdapter } from '../src/opencode-adapter';

describe('OpencodeAdapter', () => {
  const adapter = new OpencodeAdapter();

  describe('basic properties', () => {
    it('has correct adapter type', () => {
      expect(adapter.adapterType).toBe('opencode');
    });

    it('has correct display name', () => {
      expect(adapter.displayName).toBe('OpenCode');
    });

    it('uses TUI menus by default', () => {
      expect(adapter.usesTuiMenus).toBe(true);
    });

    it('declares AGENTS.md as the auto-loaded memory file', () => {
      const files = adapter.getWorkspaceFiles();
      const agentsMd = files.find((f) => f.relativePath === 'AGENTS.md');
      expect(agentsMd).toBeDefined();
      expect(agentsMd?.autoLoaded).toBe(true);
      expect(agentsMd?.type).toBe('memory');
    });
  });

  describe('command/args/env', () => {
    it('returns the opencode command', () => {
      expect(adapter.getCommand()).toBe('opencode');
    });

    it('returns empty args in interactive mode (bare opencode TUI)', () => {
      const args = adapter.getArgs({
        name: 'test',
        type: 'opencode',
        adapterConfig: { interactive: true },
      } as SpawnConfig);
      expect(args).toEqual([]);
    });

    it('returns `run --dangerously-skip-permissions` in non-interactive mode', () => {
      const args = adapter.getArgs({ name: 'test', type: 'opencode' });
      expect(args).toEqual(['run', '--dangerously-skip-permissions']);
    });

    it('forwards OPENCODE_CONFIG_CONTENT from spawn config env into the child env', () => {
      const env = adapter.getEnv({
        name: 'test',
        type: 'opencode',
        env: {
          OPENCODE_CONFIG_CONTENT: '{"provider":{"cerebras":{}}}',
        },
      } as SpawnConfig);
      expect(env.OPENCODE_CONFIG_CONTENT).toBe(
        '{"provider":{"cerebras":{}}}',
      );
    });

    it('always sets OPENCODE_DISABLE_AUTOUPDATE + OPENCODE_DISABLE_TERMINAL_TITLE', () => {
      const env = adapter.getEnv({ name: 'test', type: 'opencode' });
      expect(env.OPENCODE_DISABLE_AUTOUPDATE).toBe('1');
      expect(env.OPENCODE_DISABLE_TERMINAL_TITLE).toBe('1');
    });

    it('forwards ANTHROPIC_API_KEY when supplied via credentials', () => {
      const env = adapter.getEnv({
        name: 'test',
        type: 'opencode',
        adapterConfig: { anthropicKey: 'sk-ant-test' },
      } as SpawnConfig);
      expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
    });

    it('forwards OPENAI_API_KEY + OPENAI_BASE_URL when both are supplied', () => {
      const env = adapter.getEnv({
        name: 'test',
        type: 'opencode',
        adapterConfig: {
          openaiKey: 'sk-test',
          openaiBaseUrl: 'https://api.cerebras.ai/v1',
        },
      } as SpawnConfig);
      expect(env.OPENAI_API_KEY).toBe('sk-test');
      expect(env.OPENAI_BASE_URL).toBe('https://api.cerebras.ai/v1');
    });
  });

  describe('detectLogin', () => {
    it('flags missing-provider-config errors', () => {
      const detection = adapter.detectLogin(
        'Error: no provider configured. Run opencode auth login.',
      );
      expect(detection.required).toBe(true);
      expect(detection.type).toBe('api_key');
    });

    it('flags provider-rejected credentials (401)', () => {
      const detection = adapter.detectLogin(
        'opencode provider error: 401 Unauthorized',
      );
      expect(detection.required).toBe(true);
      expect(detection.type).toBe('api_key');
    });

    it('returns required:false for normal session output', () => {
      const detection = adapter.detectLogin('> build · gpt-oss-120b');
      expect(detection.required).toBe(false);
    });
  });

  describe('detectBlockingPrompt', () => {
    it('flags the auto-rejected permission request as a blocking prompt', () => {
      const detection = adapter.detectBlockingPrompt(
        '! permission requested: external_directory (/home/user/*); auto-rejecting',
      );
      expect(detection.detected).toBe(true);
      expect(detection.type).toBe('permission');
    });

    it('returns detected:false for normal session output', () => {
      const detection = adapter.detectBlockingPrompt(
        'Wrote file successfully.',
      );
      expect(detection.detected).toBe(false);
    });
  });

  describe('detectLoading', () => {
    it('detects the active build header as loading', () => {
      expect(adapter.detectLoading('> build · gpt-oss-120b')).toBe(true);
    });

    it('detects tool-call status lines as loading (after stripAnsi removes the arrow prefix)', () => {
      // BaseCodingAdapter.stripAnsi strips `←` as TUI decoration, so the
      // actual signal opencode-adapter sees is " Write /path" — leading
      // space + verb + path. The test passes the post-stripAnsi shape.
      expect(adapter.detectLoading(' Write /tmp/x.py')).toBe(true);
    });

    it('does not flag a terminal "Wrote file" line as loading', () => {
      expect(adapter.detectLoading('Wrote file successfully.')).toBe(false);
    });
  });

  describe('detectTaskComplete', () => {
    it('flags the canonical "Wrote file successfully" line as complete', () => {
      expect(adapter.detectTaskComplete('Wrote file successfully.')).toBe(true);
    });

    it('does not flag a still-loading session as complete', () => {
      expect(adapter.detectTaskComplete('> build · gpt-oss-120b')).toBe(false);
    });
  });

  describe('detectReady', () => {
    it('detects an idle TUI prompt as ready', () => {
      expect(adapter.detectReady('Some output\n> ')).toBe(true);
    });

    it('does not flag an active build line as ready', () => {
      expect(adapter.detectReady('> build · gpt-oss-120b')).toBe(false);
    });
  });

  describe('healthCheckCommand', () => {
    it('returns the canonical opencode --version command', () => {
      expect(adapter.getHealthCheckCommand()).toBe('opencode --version');
    });
  });
});
