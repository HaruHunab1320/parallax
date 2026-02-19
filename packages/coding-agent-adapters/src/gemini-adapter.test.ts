/**
 * Gemini Adapter Tests
 */

import { describe, it, expect } from 'vitest';
import { GeminiAdapter } from './gemini-adapter';
import type { SpawnConfig } from 'pty-manager';

describe('GeminiAdapter', () => {
  const adapter = new GeminiAdapter();

  describe('basic properties', () => {
    it('should have correct adapter type', () => {
      expect(adapter.adapterType).toBe('gemini');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Google Gemini');
    });
  });

  describe('installation', () => {
    it('should have install command', () => {
      expect(adapter.installation.command).toBeTruthy();
    });

    it('should have docs URL', () => {
      expect(adapter.installation.docsUrl).toBeTruthy();
    });
  });

  describe('getCommand()', () => {
    it('should return gemini', () => {
      expect(adapter.getCommand()).toBe('gemini');
    });
  });

  describe('getArgs()', () => {
    it('should include --non-interactive flag by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'gemini' };
      const args = adapter.getArgs(config);

      expect(args).toContain('--non-interactive');
    });

    it('should include --output-format text by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'gemini' };
      const args = adapter.getArgs(config);

      expect(args).toContain('--output-format');
      expect(args).toContain('text');
    });

    it('should NOT include --non-interactive when interactive: true', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'gemini',
        adapterConfig: { interactive: true },
      };
      const args = adapter.getArgs(config);

      expect(args).not.toContain('--non-interactive');
      expect(args).not.toContain('--output-format');
    });

    it('should include --cwd when workdir specified', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'gemini',
        workdir: '/my/project',
      };
      const args = adapter.getArgs(config);

      expect(args).toContain('--cwd');
      expect(args).toContain('/my/project');
    });

    it('should NOT include --cwd in interactive mode (PTY sets cwd)', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'gemini',
        workdir: '/my/project',
        adapterConfig: { interactive: true },
      };
      const args = adapter.getArgs(config);

      expect(args).not.toContain('--cwd');
      expect(args).not.toContain('--non-interactive');
    });
  });

  describe('getEnv()', () => {
    it('should set GOOGLE_API_KEY from credentials', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'gemini',
        adapterConfig: {
          googleKey: 'google-test-key',
        },
      };
      const env = adapter.getEnv(config);

      expect(env.GOOGLE_API_KEY).toBe('google-test-key');
    });

    it('should set GEMINI_API_KEY from credentials', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'gemini',
        adapterConfig: {
          googleKey: 'google-test-key',
        },
      };
      const env = adapter.getEnv(config);

      expect(env.GEMINI_API_KEY).toBe('google-test-key');
    });

    it('should set GEMINI_MODEL from config env', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'gemini',
        env: {
          GEMINI_MODEL: 'gemini-pro',
        },
      };
      const env = adapter.getEnv(config);

      expect(env.GEMINI_MODEL).toBe('gemini-pro');
    });

    it('should disable color output by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'gemini' };
      const env = adapter.getEnv(config);

      expect(env.NO_COLOR).toBe('1');
    });

    it('should NOT disable color when interactive: true', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'gemini',
        adapterConfig: { interactive: true },
      };
      const env = adapter.getEnv(config);

      expect(env.NO_COLOR).toBeUndefined();
    });

    it('should still set API key in interactive mode', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'gemini',
        adapterConfig: {
          googleKey: 'google-test-key',
          interactive: true,
        },
      };
      const env = adapter.getEnv(config);

      expect(env.GOOGLE_API_KEY).toBe('google-test-key');
      expect(env.NO_COLOR).toBeUndefined();
    });
  });

  describe('detectLogin()', () => {
    it('should detect API key not found', () => {
      const result = adapter.detectLogin('Error: API key not found');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect GOOGLE_API_KEY mention', () => {
      const result = adapter.detectLogin('Please set GOOGLE_API_KEY');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect GEMINI_API_KEY mention', () => {
      const result = adapter.detectLogin('Missing GEMINI_API_KEY');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect OAuth flow', () => {
      const result = adapter.detectLogin('Sign in with Google to continue');

      expect(result.required).toBe(true);
      expect(result.type).toBe('oauth');
    });

    it('should detect auth dialog (AuthDialog.tsx)', () => {
      const result = adapter.detectLogin('How would you like to authenticate for this project?');

      expect(result.required).toBe(true);
      expect(result.type).toBe('oauth');
    });

    it('should detect auth dialog with Get started + login options', () => {
      const result = adapter.detectLogin('Get started\nLogin with Google\nUse Gemini API Key\nVertex AI');

      expect(result.required).toBe(true);
      expect(result.type).toBe('oauth');
    });

    it('should detect Gemini API key entry dialog (ApiAuthDialog.tsx)', () => {
      const result = adapter.detectLogin('Enter Gemini API Key');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect auth in-progress (AuthInProgress.tsx)', () => {
      const result = adapter.detectLogin('Waiting for auth... (Press ESC or CTRL+C to cancel)');

      expect(result.required).toBe(true);
      expect(result.type).toBe('oauth');
    });

    it('should detect gcloud auth requirement', () => {
      const result = adapter.detectLogin('Run gcloud auth application-default login');

      expect(result.required).toBe(true);
      expect(result.type).toBe('browser');
      expect(result.instructions).toContain('gcloud');
    });

    it('should detect ADC requirement', () => {
      const result = adapter.detectLogin('Application Default Credentials not found');

      expect(result.required).toBe(true);
    });

    it('should return not required for normal output', () => {
      const result = adapter.detectLogin('Hello from Gemini!');

      expect(result.required).toBe(false);
    });
  });

  describe('detectBlockingPrompt()', () => {
    it('should detect login as blocking prompt', () => {
      const result = adapter.detectBlockingPrompt('API key not found');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('login');
    });

    it('should detect model selection', () => {
      const result = adapter.detectBlockingPrompt('Select model:\n1) gemini-pro\n2) gemini-ultra');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('model_select');
    });

    it('should detect project selection', () => {
      const result = adapter.detectBlockingPrompt('Select Google Cloud project:');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('project_select');
    });

    it('should detect safety filter', () => {
      const result = adapter.detectBlockingPrompt('Content blocked by safety filter');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('unknown');
      expect(result.prompt).toContain('Safety filter');
    });

    it('should auto-respond to Apply this change with keys:enter', () => {
      const result = adapter.detectBlockingPrompt('Apply this change?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should auto-respond to "Allow execution of" with keys:enter', () => {
      const result = adapter.detectBlockingPrompt('Allow execution of: \'ls -la\'?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should auto-respond to "Do you want to proceed?" with keys:enter', () => {
      const result = adapter.detectBlockingPrompt('Do you want to proceed?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should auto-respond to Waiting for user confirmation with keys:enter', () => {
      const result = adapter.detectBlockingPrompt('Waiting for user confirmation');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should detect account validation (ValidationDialog.tsx)', () => {
      const result = adapter.detectBlockingPrompt('Further action is required to use this service.');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('config');
      expect(result.canAutoRespond).toBe(false);
    });

    it('should detect account verification prompt', () => {
      const result = adapter.detectBlockingPrompt('Verify your account');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('config');
    });

    it('should detect verification wait', () => {
      const result = adapter.detectBlockingPrompt('Waiting for verification... (Press ESC or CTRL+C to cancel)');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('config');
    });

    it('should prioritize permission prompt over login-like text in same output', () => {
      const result = adapter.detectBlockingPrompt('GEMINI_API_KEY set\nApply this change?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should return not detected for normal output', () => {
      const result = adapter.detectBlockingPrompt('Processing your request...');

      expect(result.detected).toBe(false);
    });
  });

  describe('detectReady()', () => {
    it('should detect Type your message prompt (Composer.tsx)', () => {
      expect(adapter.detectReady('> Type your message or @path/to/file')).toBe(true);
    });

    it('should detect > input prompt glyph (InputPrompt.tsx)', () => {
      expect(adapter.detectReady('> What would you like to do?')).toBe(true);
    });

    it('should detect ! prompt glyph', () => {
      expect(adapter.detectReady('! Enter your command')).toBe(true);
    });

    it('should detect * prompt glyph', () => {
      expect(adapter.detectReady('* Ready for input')).toBe(true);
    });

    it('should detect (r:) prompt mode', () => {
      expect(adapter.detectReady('some output (r:)')).toBe(true);
    });

    it('should detect How can I help', () => {
      expect(adapter.detectReady('How can I help you?')).toBe(true);
    });

    it('should detect gemini> prompt', () => {
      expect(adapter.detectReady('gemini> ')).toBe(true);
    });

    it('should NOT detect bare "Gemini" mention (too broad)', () => {
      expect(adapter.detectReady('Gemini CLI v1.0.0')).toBe(false);
    });

    it('should detect ready when "Type your message" present even with stale trust text', () => {
      // "Type your message" is a definitive positive indicator that overrides negative guards.
      // After auth/trust completes, TUI re-renders may include stale dialog text alongside
      // the ready prompt. The positive match should always win.
      expect(adapter.detectReady('Do you trust this folder?\n> Type your message')).toBe(true);
    });

    it('should NOT detect ready when ONLY trust prompt is present (no ready indicator)', () => {
      expect(adapter.detectReady('Do you trust this folder?')).toBe(false);
    });

    it('should NOT detect ready when auth dialog is present', () => {
      expect(adapter.detectReady('How would you like to authenticate for this project?')).toBe(false);
    });

    it('should NOT detect ready when waiting for auth', () => {
      expect(adapter.detectReady('Waiting for auth...')).toBe(false);
    });

    it('should NOT detect ready when privacy consent is shown', () => {
      expect(adapter.detectReady('Allow Google to use this data')).toBe(false);
    });

    it('should return false for loading output', () => {
      expect(adapter.detectReady('Initializing...')).toBe(false);
    });
  });

  describe('parseOutput()', () => {
    it('should parse complete response', () => {
      const result = adapter.parseOutput('Here is the answer.\n');

      expect(result).not.toBeNull();
      expect(result?.isComplete).toBe(true);
    });

    it('should remove safety warnings from content', () => {
      const result = adapter.parseOutput('[Safety Warning] Filtered\nActual content Done.');

      expect(result).not.toBeNull();
      expect(result?.content).not.toContain('[Safety');
    });

    it('should detect questions', () => {
      const result = adapter.parseOutput('Do you want me to continue?\n');

      expect(result?.isQuestion).toBe(true);
    });

    it('should return null for incomplete output', () => {
      const result = adapter.parseOutput('Generating response');

      expect(result).toBeNull();
    });
  });

  describe('getPromptPattern()', () => {
    it('should match gemini> prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('gemini> '.match(pattern)).toBeTruthy();
    });

    it('should NOT match bare > prompt (too broad)', () => {
      const pattern = adapter.getPromptPattern();
      expect('> '.match(pattern)).toBeFalsy();
    });
  });

  describe('autoResponseRules', () => {
    it('should have trust folder rule with keys: ["enter"] and once: true', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('trust current folder')
      );

      expect(rule).toBeDefined();
      expect(rule?.responseType).toBe('keys');
      expect(rule?.keys).toEqual(['enter']);
      expect(rule?.once).toBe(true);
      expect(rule?.safe).toBe(true);
    });

    it('should match "Do you trust this folder?" (FolderTrustDialog.tsx)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('trust current folder')
      );
      expect(rule?.pattern.test('Do you trust this folder?')).toBe(true);
    });

    it('should match trust folder/parent folder variants', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('trust current folder')
      );
      expect(rule?.pattern.test('Trust folder (/my/project)')).toBe(true);
      expect(rule?.pattern.test('Trust parent folder (/my)')).toBe(true);
    });

    it('should have multi-folder trust rule with once: true', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('multiple folders')
      );

      expect(rule).toBeDefined();
      expect(rule?.responseType).toBe('keys');
      expect(rule?.keys).toEqual(['enter']);
      expect(rule?.once).toBe(true);
    });

    it('should match multi-folder trust prompt (MultiFolderTrustDialog.tsx)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('multiple folders')
      );
      expect(rule?.pattern.test('Do you trust the following folders being added to this workspace?')).toBe(true);
    });

    it('should have privacy consent rule that declines (Down+Enter)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('data collection')
      );

      expect(rule).toBeDefined();
      expect(rule?.responseType).toBe('keys');
      expect(rule?.keys).toEqual(['down', 'enter']);
      expect(rule?.once).toBe(true);
    });

    it('should match privacy consent prompt (CloudFreePrivacyNotice.tsx)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('data collection')
      );
      expect(rule?.pattern.test('Allow Google to use this data to develop and improve our products?')).toBe(true);
    });
  });

  describe('detectExit()', () => {
    it('should detect folder trust rejection exit (FolderTrustDialog.tsx)', () => {
      const result = adapter.detectExit('A folder trust level must be selected to continue. Exiting');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(1);
    });

    it('should detect logout exit', () => {
      const result = adapter.detectExit('You are now logged out');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(0);
    });

    it('should not detect exit for normal output', () => {
      const result = adapter.detectExit('Processing...');

      expect(result.exited).toBe(false);
    });

    it('should detect command not found exit (from base)', () => {
      const result = adapter.detectExit('Command not found: gemini');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(127);
    });
  });

  describe('getHealthCheckCommand()', () => {
    it('should return version command', () => {
      expect(adapter.getHealthCheckCommand()).toBe('gemini --version');
    });
  });

  describe('getWorkspaceFiles()', () => {
    it('should return GEMINI.md as primary memory file', () => {
      const files = adapter.getWorkspaceFiles();
      const memory = files.find(f => f.type === 'memory');
      expect(memory).toBeDefined();
      expect(memory!.relativePath).toBe('GEMINI.md');
      expect(memory!.autoLoaded).toBe(true);
      expect(memory!.format).toBe('markdown');
    });

    it('should include settings.json config', () => {
      const files = adapter.getWorkspaceFiles();
      const config = files.find(f => f.relativePath === '.gemini/settings.json');
      expect(config).toBeDefined();
      expect(config!.type).toBe('config');
      expect(config!.format).toBe('json');
    });

    it('should include styles directory', () => {
      const files = adapter.getWorkspaceFiles();
      const styles = files.find(f => f.relativePath === '.gemini/styles');
      expect(styles).toBeDefined();
      expect(styles!.autoLoaded).toBe(false);
    });
  });

  describe('memoryFilePath', () => {
    it('should return GEMINI.md', () => {
      expect(adapter.memoryFilePath).toBe('GEMINI.md');
    });
  });
});
