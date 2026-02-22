/**
 * Codex Adapter Tests
 */

import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../src/codex-adapter';
import type { SpawnConfig } from 'pty-manager';

describe('CodexAdapter', () => {
  const adapter = new CodexAdapter();

  describe('basic properties', () => {
    it('should have correct adapter type', () => {
      expect(adapter.adapterType).toBe('codex');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('OpenAI Codex');
    });
  });

  describe('installation', () => {
    it('should have npm install command', () => {
      expect(adapter.installation.command).toContain('npm install');
      expect(adapter.installation.command).toContain('openai');
    });

    it('should have docs URL', () => {
      expect(adapter.installation.docsUrl).toContain('openai');
    });
  });

  describe('getCommand()', () => {
    it('should return codex', () => {
      expect(adapter.getCommand()).toBe('codex');
    });
  });

  describe('getArgs()', () => {
    it('should include --quiet flag by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'codex' };
      const args = adapter.getArgs(config);

      expect(args).toContain('--quiet');
    });

    it('should NOT include --quiet when interactive: true', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'codex',
        adapterConfig: { interactive: true },
      };
      const args = adapter.getArgs(config);

      expect(args).not.toContain('--quiet');
    });

    it('should include --cwd when workdir specified', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'codex',
        workdir: '/my/project',
      };
      const args = adapter.getArgs(config);

      expect(args).toContain('--cwd');
      expect(args).toContain('/my/project');
    });

    it('should NOT include --cwd in interactive mode (PTY sets cwd)', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'codex',
        workdir: '/my/project',
        adapterConfig: { interactive: true },
      };
      const args = adapter.getArgs(config);

      expect(args).not.toContain('--cwd');
      expect(args).not.toContain('--quiet');
    });
  });

  describe('getEnv()', () => {
    it('should set OPENAI_API_KEY from credentials', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'codex',
        adapterConfig: {
          openaiKey: 'sk-openai-test-key',
        },
      };
      const env = adapter.getEnv(config);

      expect(env.OPENAI_API_KEY).toBe('sk-openai-test-key');
    });

    it('should set OPENAI_MODEL from config env', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'codex',
        env: {
          OPENAI_MODEL: 'gpt-4',
        },
      };
      const env = adapter.getEnv(config);

      expect(env.OPENAI_MODEL).toBe('gpt-4');
    });

    it('should disable color output by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'codex' };
      const env = adapter.getEnv(config);

      expect(env.NO_COLOR).toBe('1');
    });

    it('should NOT disable color when interactive: true', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'codex',
        adapterConfig: { interactive: true },
      };
      const env = adapter.getEnv(config);

      expect(env.NO_COLOR).toBeUndefined();
    });

    it('should still set API key in interactive mode', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'codex',
        adapterConfig: {
          openaiKey: 'sk-openai-test-key',
          interactive: true,
        },
      };
      const env = adapter.getEnv(config);

      expect(env.OPENAI_API_KEY).toBe('sk-openai-test-key');
      expect(env.NO_COLOR).toBeUndefined();
    });
  });

  describe('detectLogin()', () => {
    it('should detect API key not found', () => {
      const result = adapter.detectLogin('Error: API key not found');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect OPENAI_API_KEY mention', () => {
      const result = adapter.detectLogin('Please set OPENAI_API_KEY');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect Unauthorized error', () => {
      const result = adapter.detectLogin('Error: Unauthorized');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect Invalid API key', () => {
      const result = adapter.detectLogin('API key is invalid');

      expect(result.required).toBe(true);
    });

    it('should detect onboarding auth menu (auth.rs)', () => {
      const result = adapter.detectLogin('Sign in with ChatGPT');

      expect(result.required).toBe(true);
      expect(result.type).toBe('oauth');
    });

    it('should detect "Provide your own API key" auth option', () => {
      const result = adapter.detectLogin('Provide your own API key');

      expect(result.required).toBe(true);
      expect(result.type).toBe('oauth');
    });

    it('should detect device code login flow (headless_chatgpt_login.rs)', () => {
      const result = adapter.detectLogin('Preparing device code login');

      expect(result.required).toBe(true);
      expect(result.type).toBe('device_code');
    });

    it('should detect "Open this link in your browser" device code flow', () => {
      const result = adapter.detectLogin('Open this link in your browser and sign in: https://auth.openai.com/device');

      expect(result.required).toBe(true);
      expect(result.type).toBe('device_code');
      expect(result.url).toBe('https://auth.openai.com/device');
    });

    it('should detect "Enter this one-time code" device code flow', () => {
      const result = adapter.detectLogin('Enter this one-time code: ABC-123');

      expect(result.required).toBe(true);
      expect(result.type).toBe('device_code');
      expect(result.deviceCode).toBe('ABC-123');
    });

    it('should detect legacy device code flow', () => {
      const result = adapter.detectLogin('Enter the device code ABC-123 at https://openai.com/auth');

      expect(result.required).toBe(true);
      expect(result.type).toBe('device_code');
      expect(result.url).toBe('https://openai.com/auth');
      expect(result.deviceCode).toBe('ABC-123');
    });

    it('should return not required for normal output', () => {
      const result = adapter.detectLogin('Hello from Codex!');

      expect(result.required).toBe(false);
    });
  });

  describe('detectBlockingPrompt()', () => {
    it('should detect login as blocking prompt', () => {
      const result = adapter.detectBlockingPrompt('OPENAI_API_KEY not set');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('login');
    });

    it('should auto-respond to "run the following command" with keys:enter (approval_overlay.rs)', () => {
      const result = adapter.detectBlockingPrompt('Would you like to run the following command?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should auto-respond to "approve access" with keys:enter', () => {
      const result = adapter.detectBlockingPrompt('Do you want to approve access to "api.example.com"?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should auto-respond to "make the following edits" with keys:enter', () => {
      const result = adapter.detectBlockingPrompt('Would you like to make the following edits?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should auto-respond to "Press enter to confirm or esc to cancel"', () => {
      const result = adapter.detectBlockingPrompt('Press enter to confirm or esc to cancel');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should prioritize permission prompt over login-like text', () => {
      const result = adapter.detectBlockingPrompt('OPENAI_API_KEY ok\nWould you like to run the following command?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
    });

    it('should detect Windows sandbox setup (chatwidget.rs)', () => {
      const result = adapter.detectBlockingPrompt('Set up default sandbox (requires Administrator permissions)');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('config');
      expect(result.canAutoRespond).toBe(false);
    });

    it('should detect multi-step user input (request_user_input)', () => {
      const result = adapter.detectBlockingPrompt('Type your answer (optional)\nSelect an option to add notes');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('unknown');
      expect(result.canAutoRespond).toBe(false);
    });

    it('should detect model selection', () => {
      const result = adapter.detectBlockingPrompt('Select model:\n1) gpt-4\n2) gpt-3.5-turbo');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('model_select');
    });

    it('should detect organization selection', () => {
      const result = adapter.detectBlockingPrompt('You have multiple organizations. Select organization:');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('config');
      expect(result.prompt).toContain('Organization');
    });

    it('should detect rate limit', () => {
      const result = adapter.detectBlockingPrompt('Rate limit exceeded. Please wait and retry.');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('unknown');
      expect(result.prompt).toContain('Rate limit');
    });

    it('should return not detected for normal output', () => {
      const result = adapter.detectBlockingPrompt('Processing your request...');

      expect(result.detected).toBe(false);
    });
  });

  describe('detectReady()', () => {
    it('should detect › prompt glyph (chat_composer.rs)', () => {
      expect(adapter.detectReady('› explain this codebase')).toBe(true);
    });

    it('should detect idle composer footer hints', () => {
      expect(adapter.detectReady('? for shortcuts 100% context left')).toBe(true);
      expect(adapter.detectReady('tab to queue message 98% context left')).toBe(true);
    });

    it('should detect placeholder suggestions (chatwidget.rs)', () => {
      expect(adapter.detectReady('explain this codebase')).toBe(true);
      expect(adapter.detectReady('summarize recent commits')).toBe(true);
      expect(adapter.detectReady('find and fix a bug in @filename')).toBe(true);
    });

    it('should detect How can I help', () => {
      expect(adapter.detectReady('How can I help you?')).toBe(true);
    });

    it('should detect codex> prompt', () => {
      expect(adapter.detectReady('codex> ')).toBe(true);
    });

    it('should NOT detect ready when trust prompt is present', () => {
      expect(adapter.detectReady('Do you trust the contents of this directory?')).toBe(false);
    });

    it('should NOT detect ready when auth prompt is present', () => {
      expect(adapter.detectReady('Sign in with ChatGPT\n› ')).toBe(false);
    });

    it('should NOT detect menu selection rows as idle composer', () => {
      expect(adapter.detectReady('› 1. Yes, proceed (y)')).toBe(false);
      expect(adapter.detectReady('› 2. No, cancel (esc)')).toBe(false);
    });

    it('should detect ready even with stale update text when composer is present', () => {
      const output = 'Update available! 1.0.0 -> 1.1.0\n...\n› Ask Codex to do anything';
      expect(adapter.detectReady(output)).toBe(true);
    });

    it('should NOT detect ready when update prompt is present', () => {
      expect(adapter.detectReady('Update available! 1.0.0 -> 1.1.0')).toBe(false);
    });

    it('should NOT detect ready when full access prompt is present', () => {
      expect(adapter.detectReady('Enable full access?')).toBe(false);
    });

    it('should NOT detect ready when cwd selection is present', () => {
      expect(adapter.detectReady('Choose working directory to resume this session')).toBe(false);
    });

    it('should return false for loading output', () => {
      expect(adapter.detectReady('Starting up...')).toBe(false);
    });
  });

  describe('parseOutput()', () => {
    it('should parse complete response', () => {
      const result = adapter.parseOutput('Here is the answer.\n');

      expect(result).not.toBeNull();
      expect(result?.isComplete).toBe(true);
    });

    it('should detect questions', () => {
      const result = adapter.parseOutput('Should I proceed?\n');

      expect(result?.isQuestion).toBe(true);
    });

    it('should return null for incomplete output', () => {
      const result = adapter.parseOutput('Generating code');

      expect(result).toBeNull();
    });
  });

  describe('getPromptPattern()', () => {
    it('should match codex prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('codex> '.match(pattern)).toBeTruthy();
    });
  });

  describe('autoResponseRules', () => {
    it('should have update skip rule with Down+Enter key sequence', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('update')
      );

      expect(rule).toBeDefined();
      expect(rule?.responseType).toBe('keys');
      expect(rule?.keys).toEqual(['down', 'enter']);
    });

    it('should match update prompt from catalog (update_prompt.rs)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('update')
      );
      expect(rule?.pattern.test('Update available! 1.0.0 -> 1.1.0')).toBe(true);
      expect(rule?.pattern.test('Update now (runs `npm install`)')).toBe(true);
      expect(rule?.pattern.test('Skip until next version')).toBe(true);
    });

    it('should have trust directory rule with Enter key and once: true', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('trust directory')
      );

      expect(rule).toBeDefined();
      expect(rule?.responseType).toBe('keys');
      expect(rule?.keys).toEqual(['enter']);
      expect(rule?.once).toBe(true);
    });

    it('should match exact trust text from source (trust_directory.rs)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('trust directory')
      );
      expect(rule?.pattern.test('Do you trust the contents of this directory? Working with untrusted contents comes with higher risk of prompt injection.')).toBe(true);
      expect(rule?.pattern.test('Yes, continue')).toBe(true);
    });

    it('should match trust prompt with stripped spaces (cursor codes removed)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('trust directory')
      );
      expect(rule?.pattern.test('trust this directory')).toBe(true);
    });

    it('should have model migration rule with once: true (model_migration.rs)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('model migration')
      );

      expect(rule).toBeDefined();
      expect(rule?.responseType).toBe('keys');
      expect(rule?.keys).toEqual(['enter']);
      expect(rule?.once).toBe(true);
    });

    it('should match model migration text from source', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('model migration')
      );
      expect(rule?.pattern.test("Choose how you'd like Codex to proceed.")).toBe(true);
      expect(rule?.pattern.test('Try new model')).toBe(true);
      expect(rule?.pattern.test('Use existing model')).toBe(true);
    });

    it('should have cwd selection rule (cwd_prompt.rs)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('working directory')
      );

      expect(rule).toBeDefined();
      expect(rule?.responseType).toBe('keys');
      expect(rule?.keys).toEqual(['enter']);
    });

    it('should match cwd selection text from source', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('working directory')
      );
      expect(rule?.pattern.test('Choose working directory to resume this session')).toBe(true);
      expect(rule?.pattern.test('Choose working directory to fork this session')).toBe(true);
    });

    it('should have full access confirmation rule with once: true (chatwidget.rs)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('full access')
      );

      expect(rule).toBeDefined();
      expect(rule?.responseType).toBe('keys');
      expect(rule?.keys).toEqual(['enter']);
      expect(rule?.once).toBe(true);
    });

    it('should match full access prompt', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('full access')
      );
      expect(rule?.pattern.test('Enable full access?')).toBe(true);
    });

    it('should have dumb terminal confirmation rule as text type (main.rs)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('dumb terminal')
      );

      expect(rule).toBeDefined();
      expect(rule?.responseType).toBe('text');
      expect(rule?.response).toBe('y');
    });

    it('should match dumb terminal prompt', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('dumb terminal')
      );
      expect(rule?.pattern.test('Continue anyway? [y/N]:')).toBe(true);
    });
  });

  describe('detectExit()', () => {
    it('should detect session end with resume command (main.rs:404)', () => {
      const result = adapter.detectExit('To continue this session, run codex --resume abc123');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(0);
    });

    it('should detect update completed (main.rs:461)', () => {
      const result = adapter.detectExit('Update ran successfully! Please restart Codex.');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(0);
    });

    it('should detect command not found exit (from base)', () => {
      const result = adapter.detectExit('Command not found: codex');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(127);
    });

    it('should not detect exit for normal output', () => {
      const result = adapter.detectExit('Processing...');

      expect(result.exited).toBe(false);
    });
  });

  describe('getHealthCheckCommand()', () => {
    it('should return version command', () => {
      expect(adapter.getHealthCheckCommand()).toBe('codex --version');
    });
  });

  describe('getWorkspaceFiles()', () => {
    it('should return AGENTS.md as primary memory file', () => {
      const files = adapter.getWorkspaceFiles();
      const memory = files.find(f => f.type === 'memory');
      expect(memory).toBeDefined();
      expect(memory!.relativePath).toBe('AGENTS.md');
      expect(memory!.autoLoaded).toBe(true);
      expect(memory!.format).toBe('markdown');
    });

    it('should include codex.md as secondary memory', () => {
      const files = adapter.getWorkspaceFiles();
      const codexMd = files.find(f => f.relativePath === 'codex.md');
      expect(codexMd).toBeDefined();
      expect(codexMd!.type).toBe('memory');
      expect(codexMd!.autoLoaded).toBe(true);
    });

    it('should include config.json', () => {
      const files = adapter.getWorkspaceFiles();
      const config = files.find(f => f.relativePath === '.codex/config.json');
      expect(config).toBeDefined();
      expect(config!.type).toBe('config');
      expect(config!.format).toBe('json');
    });
  });

  describe('memoryFilePath', () => {
    it('should return AGENTS.md (first memory file)', () => {
      expect(adapter.memoryFilePath).toBe('AGENTS.md');
    });
  });
});
