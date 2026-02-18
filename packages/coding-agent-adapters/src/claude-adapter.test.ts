/**
 * Claude Adapter Tests
 */

import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from './claude-adapter';
import type { SpawnConfig } from 'pty-manager';

describe('ClaudeAdapter', () => {
  const adapter = new ClaudeAdapter();

  describe('basic properties', () => {
    it('should have correct adapter type', () => {
      expect(adapter.adapterType).toBe('claude');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Claude Code');
    });
  });

  describe('installation', () => {
    it('should have npm install command', () => {
      expect(adapter.installation.command).toBe('npm install -g @anthropic-ai/claude-code');
    });

    it('should have npx alternative', () => {
      expect(adapter.installation.alternatives).toContain('npx @anthropic-ai/claude-code (run without installing)');
    });

    it('should have brew alternative', () => {
      expect(adapter.installation.alternatives?.some(a => a.includes('brew'))).toBe(true);
    });

    it('should have docs URL', () => {
      expect(adapter.installation.docsUrl).toContain('anthropic.com');
    });

    it('should have min version', () => {
      expect(adapter.installation.minVersion).toBe('1.0.0');
    });
  });

  describe('getCommand()', () => {
    it('should return claude', () => {
      expect(adapter.getCommand()).toBe('claude');
    });
  });

  describe('getArgs()', () => {
    it('should include --print flag by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'claude' };
      const args = adapter.getArgs(config);

      expect(args).toContain('--print');
    });

    it('should NOT include --print flag when interactive: true', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'claude',
        adapterConfig: { interactive: true },
      };
      const args = adapter.getArgs(config);

      expect(args).not.toContain('--print');
    });

    it('should include --cwd when workdir specified', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'claude',
        workdir: '/my/project',
      };
      const args = adapter.getArgs(config);

      expect(args).toContain('--cwd');
      expect(args).toContain('/my/project');
    });

    it('should not include --cwd when no workdir', () => {
      const config: SpawnConfig = { name: 'test', type: 'claude' };
      const args = adapter.getArgs(config);

      expect(args).not.toContain('--cwd');
    });

    it('should NOT include --cwd in interactive mode (PTY sets cwd)', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'claude',
        workdir: '/my/project',
        adapterConfig: { interactive: true },
      };
      const args = adapter.getArgs(config);

      expect(args).not.toContain('--cwd');
      expect(args).not.toContain('/my/project');
    });
  });

  describe('getEnv()', () => {
    it('should set ANTHROPIC_API_KEY from credentials', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'claude',
        adapterConfig: {
          anthropicKey: 'sk-ant-test-key',
        },
      };
      const env = adapter.getEnv(config);

      expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test-key');
    });

    it('should set ANTHROPIC_MODEL from config env', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'claude',
        env: {
          ANTHROPIC_MODEL: 'claude-3-opus',
        },
      };
      const env = adapter.getEnv(config);

      expect(env.ANTHROPIC_MODEL).toBe('claude-3-opus');
    });

    it('should disable interactive mode by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'claude' };
      const env = adapter.getEnv(config);

      expect(env.CLAUDE_CODE_DISABLE_INTERACTIVE).toBe('true');
    });

    it('should NOT disable interactive mode when interactive: true', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'claude',
        adapterConfig: { interactive: true },
      };
      const env = adapter.getEnv(config);

      expect(env.CLAUDE_CODE_DISABLE_INTERACTIVE).toBeUndefined();
    });

    it('should still set API key in interactive mode', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'claude',
        adapterConfig: {
          anthropicKey: 'sk-ant-test-key',
          interactive: true,
        },
      };
      const env = adapter.getEnv(config);

      expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test-key');
      expect(env.CLAUDE_CODE_DISABLE_INTERACTIVE).toBeUndefined();
    });
  });

  describe('detectLogin()', () => {
    it('should detect API key not found', () => {
      const result = adapter.detectLogin('Error: API key not found');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect ANTHROPIC_API_KEY mention', () => {
      const result = adapter.detectLogin('Please set ANTHROPIC_API_KEY');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect authentication required', () => {
      const result = adapter.detectLogin('authentication required to continue');

      expect(result.required).toBe(true);
    });

    it('should detect Please sign in', () => {
      const result = adapter.detectLogin('Please sign in to continue');

      expect(result.required).toBe(true);
    });

    it('should detect Invalid API key', () => {
      const result = adapter.detectLogin('Invalid API key provided');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect browser auth with URL', () => {
      const result = adapter.detectLogin('Open this URL to authenticate: https://auth.anthropic.com/login');

      expect(result.required).toBe(true);
      expect(result.type).toBe('browser');
      expect(result.url).toBe('https://auth.anthropic.com/login');
    });

    it('should return not required for normal output', () => {
      const result = adapter.detectLogin('Hello, how can I help you?');

      expect(result.required).toBe(false);
    });
  });

  describe('detectBlockingPrompt()', () => {
    it('should detect login as blocking prompt', () => {
      const result = adapter.detectBlockingPrompt('API key not found');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('login');
      expect(result.canAutoRespond).toBe(false);
    });

    it('should detect model selection prompt', () => {
      const result = adapter.detectBlockingPrompt('Please choose a model:\n1) claude-3-opus\n2) claude-3-sonnet');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('model_select');
    });

    it('should detect API tier selection', () => {
      const result = adapter.detectBlockingPrompt('Which API tier would you like to use?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('config');
    });

    it('should detect first-time setup', () => {
      const result = adapter.detectBlockingPrompt('Welcome to Claude Code! First time setup required.');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('config');
    });

    it('should detect file access permission with auto-respond', () => {
      const result = adapter.detectBlockingPrompt('Allow access to project files? [y/n]');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('y');
    });

    it('should return not detected for normal output', () => {
      const result = adapter.detectBlockingPrompt('Working on your request...');

      expect(result.detected).toBe(false);
    });
  });

  describe('detectReady()', () => {
    it('should detect Claude Code mention', () => {
      expect(adapter.detectReady('Claude Code v1.0.0')).toBe(true);
    });

    it('should detect How can I help', () => {
      expect(adapter.detectReady('How can I help you today?')).toBe(true);
    });

    it('should detect What would you like', () => {
      expect(adapter.detectReady('What would you like me to do?')).toBe(true);
    });

    it('should detect claude> prompt', () => {
      expect(adapter.detectReady('claude> ')).toBe(true);
    });

    it('should detect Ready indicator', () => {
      expect(adapter.detectReady('Ready for input')).toBe(true);
    });

    it('should NOT detect bare > prompt (too broad)', () => {
      // Bare ">" could match prompts like "Enter value>" - should not trigger ready
      expect(adapter.detectReady('Enter value> ')).toBe(false);
    });

    it('should return false for loading output', () => {
      expect(adapter.detectReady('Loading...')).toBe(false);
    });
  });

  describe('parseOutput()', () => {
    it('should parse complete response', () => {
      const result = adapter.parseOutput('Here is the answer.\n> ');

      expect(result).not.toBeNull();
      expect(result?.isComplete).toBe(true);
      expect(result?.type).toBe('response');
    });

    it('should detect questions', () => {
      const result = adapter.parseOutput('Would you like me to continue?\n');

      expect(result).not.toBeNull();
      expect(result?.isQuestion).toBe(true);
      expect(result?.type).toBe('question');
    });

    it('should return null for incomplete output', () => {
      const result = adapter.parseOutput('Working on it');

      expect(result).toBeNull();
    });

    it('should include raw output in metadata', () => {
      const rawOutput = 'Test output Done.';
      const result = adapter.parseOutput(rawOutput);

      expect(result?.metadata?.raw).toBe(rawOutput);
    });
  });

  describe('getPromptPattern()', () => {
    it('should match claude> prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('claude> '.match(pattern)).toBeTruthy();
    });

    it('should NOT match bare > prompt (too broad)', () => {
      const pattern = adapter.getPromptPattern();
      expect('> '.match(pattern)).toBeFalsy();
    });
  });

  describe('autoResponseRules', () => {
    it('should have update decline rule with responseType text', () => {
      const rule = adapter.autoResponseRules.find(r => r.type === 'update');

      expect(rule).toBeDefined();
      expect(rule?.response).toBe('n');
      expect(rule?.responseType).toBe('text');
      expect(rule?.safe).toBe(true);
    });

    it('should have telemetry decline rule with responseType text', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('telemetry')
      );

      expect(rule).toBeDefined();
      expect(rule?.response).toBe('n');
      expect(rule?.responseType).toBe('text');
    });

    it('should have all rules with explicit responseType text', () => {
      for (const rule of adapter.autoResponseRules) {
        expect(rule.responseType).toBe('text');
      }
    });

    it('should match update prompt', () => {
      const rule = adapter.autoResponseRules.find(r => r.type === 'update');
      expect(rule?.pattern.test('A new update available! [y/n]')).toBe(true);
    });
  });

  describe('detectBlockingPrompt() permission with keys:enter', () => {
    it('should return keys:enter suggestedResponse for tool permission prompt', () => {
      const result = adapter.detectBlockingPrompt('Claude wants permission to read file.txt');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });

    it('should return keys:enter for "Do you want to" prompt', () => {
      const result = adapter.detectBlockingPrompt('Do you want to allow this action?');

      expect(result.detected).toBe(true);
      expect(result.suggestedResponse).toBe('keys:enter');
    });
  });

  describe('getHealthCheckCommand()', () => {
    it('should return version command', () => {
      expect(adapter.getHealthCheckCommand()).toBe('claude --version');
    });
  });
});
