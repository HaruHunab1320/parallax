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

    it('should return not detected for normal output', () => {
      const result = adapter.detectBlockingPrompt('Processing your request...');

      expect(result.detected).toBe(false);
    });
  });

  describe('detectReady()', () => {
    it('should detect Ready indicator', () => {
      expect(adapter.detectReady('Ready for input')).toBe(true);
    });

    it('should detect Type your message prompt', () => {
      expect(adapter.detectReady('> Type your message...')).toBe(true);
    });

    it('should detect How can I help', () => {
      expect(adapter.detectReady('How can I help you?')).toBe(true);
    });

    it('should detect gemini> prompt', () => {
      expect(adapter.detectReady('gemini> ')).toBe(true);
    });

    it('should NOT detect bare "Gemini" mention (too broad)', () => {
      // "Gemini" appears in banners alongside auth errors - should not trigger ready
      expect(adapter.detectReady('Gemini CLI v1.0.0')).toBe(false);
    });

    it('should NOT detect bare > prompt (too broad)', () => {
      // Bare ">" could match "Enter API key>" - should not trigger ready
      expect(adapter.detectReady('Enter value> ')).toBe(false);
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

  describe('getHealthCheckCommand()', () => {
    it('should return version command', () => {
      expect(adapter.getHealthCheckCommand()).toBe('gemini --version');
    });
  });
});
