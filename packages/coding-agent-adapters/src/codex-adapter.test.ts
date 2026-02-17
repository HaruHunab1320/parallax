/**
 * Codex Adapter Tests
 */

import { describe, it, expect } from 'vitest';
import { CodexAdapter } from './codex-adapter';
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
    it('should include --quiet flag', () => {
      const config: SpawnConfig = { name: 'test', type: 'codex' };
      const args = adapter.getArgs(config);

      expect(args).toContain('--quiet');
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

    it('should disable color output', () => {
      const config: SpawnConfig = { name: 'test', type: 'codex' };
      const env = adapter.getEnv(config);

      expect(env.NO_COLOR).toBe('1');
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

    it('should detect device code flow', () => {
      const result = adapter.detectLogin('Enter the device code ABC-123 at https://openai.com/auth');

      expect(result.required).toBe(true);
      expect(result.type).toBe('device_code');
      expect(result.url).toBe('https://openai.com/auth');
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
    it('should detect Codex mention', () => {
      expect(adapter.detectReady('Codex v1.0.0')).toBe(true);
    });

    it('should detect Ready indicator', () => {
      expect(adapter.detectReady('Ready for input')).toBe(true);
    });

    it('should detect How can I help', () => {
      expect(adapter.detectReady('How can I help you?')).toBe(true);
    });

    it('should detect codex> prompt', () => {
      expect(adapter.detectReady('codex> ')).toBe(true);
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
    it('should have update decline rule', () => {
      const rule = adapter.autoResponseRules.find(r => r.type === 'update');

      expect(rule).toBeDefined();
      expect(rule?.response).toBe('n');
    });

    it('should have telemetry decline rule', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('telemetry')
      );

      expect(rule).toBeDefined();
      expect(rule?.response).toBe('n');
    });

    it('should decline beta features', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('beta')
      );

      expect(rule).toBeDefined();
      expect(rule?.response).toBe('n');
    });
  });

  describe('getHealthCheckCommand()', () => {
    it('should return version command', () => {
      expect(adapter.getHealthCheckCommand()).toBe('codex --version');
    });
  });
});
