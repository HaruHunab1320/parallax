/**
 * Aider Adapter Tests
 */

import { describe, it, expect } from 'vitest';
import { AiderAdapter } from './aider-adapter';
import type { SpawnConfig } from 'pty-manager';

describe('AiderAdapter', () => {
  const adapter = new AiderAdapter();

  describe('basic properties', () => {
    it('should have correct adapter type', () => {
      expect(adapter.adapterType).toBe('aider');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Aider');
    });
  });

  describe('installation', () => {
    it('should have pip install command', () => {
      expect(adapter.installation.command).toBe('pip install aider-chat');
    });

    it('should have pipx alternative', () => {
      expect(adapter.installation.alternatives).toContain('pipx install aider-chat (isolated install)');
    });

    it('should have brew alternative', () => {
      expect(adapter.installation.alternatives?.some(a => a.includes('brew'))).toBe(true);
    });

    it('should have docs URL', () => {
      expect(adapter.installation.docsUrl).toBe('https://aider.chat/docs/install.html');
    });

    it('should have min version', () => {
      expect(adapter.installation.minVersion).toBe('0.50.0');
    });
  });

  describe('getCommand()', () => {
    it('should return aider', () => {
      expect(adapter.getCommand()).toBe('aider');
    });
  });

  describe('getArgs()', () => {
    it('should include --auto-commits flag', () => {
      const config: SpawnConfig = { name: 'test', type: 'aider' };
      const args = adapter.getArgs(config);

      expect(args).toContain('--auto-commits');
    });

    it('should include --no-pretty flag by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'aider' };
      const args = adapter.getArgs(config);

      expect(args).toContain('--no-pretty');
    });

    it('should include --no-show-diffs flag by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'aider' };
      const args = adapter.getArgs(config);

      expect(args).toContain('--no-show-diffs');
    });

    it('should NOT include --no-pretty when interactive: true', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: { interactive: true },
      };
      const args = adapter.getArgs(config);

      expect(args).not.toContain('--no-pretty');
      expect(args).not.toContain('--no-show-diffs');
    });

    it('should still include --auto-commits in interactive mode', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: { interactive: true },
      };
      const args = adapter.getArgs(config);

      expect(args).toContain('--auto-commits');
    });

    it('should include model from config env', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        env: {
          AIDER_MODEL: 'gpt-4-turbo',
        },
      };
      const args = adapter.getArgs(config);

      expect(args).toContain('--model');
      expect(args).toContain('gpt-4-turbo');
    });

    it('should not pass --model when no provider or explicit model set', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: {
          anthropicKey: 'sk-ant-test',
        },
      };
      const args = adapter.getArgs(config);

      expect(args).not.toContain('--model');
    });

    it('should use sonnet alias when provider is anthropic', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: {
          anthropicKey: 'sk-ant-test',
          provider: 'anthropic',
        },
      };
      const args = adapter.getArgs(config);

      const modelIndex = args.indexOf('--model');
      expect(args[modelIndex + 1]).toBe('sonnet');
    });

    it('should use 4o alias when provider is openai', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: {
          openaiKey: 'sk-openai-test',
          provider: 'openai',
        },
      };
      const args = adapter.getArgs(config);

      const modelIndex = args.indexOf('--model');
      expect(args[modelIndex + 1]).toBe('4o');
    });

    it('should use gemini alias when provider is google', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: {
          googleKey: 'google-test',
          provider: 'google',
        },
      };
      const args = adapter.getArgs(config);

      const modelIndex = args.indexOf('--model');
      expect(args[modelIndex + 1]).toBe('gemini');
    });

    it('should not override explicit model with provider alias', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        env: {
          AIDER_MODEL: 'gpt-4',
        },
        adapterConfig: {
          anthropicKey: 'sk-ant-test',
          provider: 'anthropic',
        },
      };
      const args = adapter.getArgs(config);

      const modelIndex = args.indexOf('--model');
      expect(args[modelIndex + 1]).toBe('gpt-4');
    });

    it('should pass API keys via --api-key flag', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: {
          anthropicKey: 'sk-ant-test',
          openaiKey: 'sk-openai-test',
        },
      };
      const args = adapter.getArgs(config);

      expect(args).toContain('--api-key');
      expect(args).toContain('anthropic=sk-ant-test');
      expect(args).toContain('openai=sk-openai-test');
    });

    it('should pass google key as gemini provider for litellm', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: {
          googleKey: 'google-test-key',
        },
      };
      const args = adapter.getArgs(config);

      expect(args).toContain('gemini=google-test-key');
    });
  });

  describe('getEnv()', () => {
    it('should not pass API keys via env (uses --api-key args instead)', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: {
          anthropicKey: 'sk-ant-test-key',
          openaiKey: 'sk-openai-test-key',
        },
      };
      const env = adapter.getEnv(config);

      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.OPENAI_API_KEY).toBeUndefined();
      expect(env.GOOGLE_API_KEY).toBeUndefined();
    });

    it('should disable color output by default', () => {
      const config: SpawnConfig = { name: 'test', type: 'aider' };
      const env = adapter.getEnv(config);

      expect(env.NO_COLOR).toBe('1');
    });

    it('should NOT disable color when interactive: true', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        adapterConfig: { interactive: true },
      };
      const env = adapter.getEnv(config);

      expect(env.NO_COLOR).toBeUndefined();
    });

    it('should pass through AIDER_NO_GIT setting', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'aider',
        env: {
          AIDER_NO_GIT: 'true',
        },
      };
      const env = adapter.getEnv(config);

      expect(env.AIDER_NO_GIT).toBe('true');
    });
  });

  describe('detectLogin()', () => {
    it('should detect No API key', () => {
      const result = adapter.detectLogin('No API key found');

      expect(result.required).toBe(true);
      expect(result.type).toBe('api_key');
    });

    it('should detect ANTHROPIC_API_KEY mention', () => {
      const result = adapter.detectLogin('Please set ANTHROPIC_API_KEY');

      expect(result.required).toBe(true);
    });

    it('should detect OPENAI_API_KEY mention', () => {
      const result = adapter.detectLogin('Missing OPENAI_API_KEY');

      expect(result.required).toBe(true);
    });

    it('should detect Invalid API key', () => {
      const result = adapter.detectLogin('Invalid API key provided');

      expect(result.required).toBe(true);
      expect(result.instructions).toContain('invalid');
    });

    it('should detect Authentication failed', () => {
      const result = adapter.detectLogin('Authentication failed');

      expect(result.required).toBe(true);
    });

    it('should return not required for normal output', () => {
      const result = adapter.detectLogin('Aider v0.50.0');

      expect(result.required).toBe(false);
    });
  });

  describe('detectBlockingPrompt()', () => {
    it('should detect login as blocking prompt', () => {
      const result = adapter.detectBlockingPrompt('Missing API key');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('login');
    });

    it('should detect model selection', () => {
      const result = adapter.detectBlockingPrompt('Which model would you like to use?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('model_select');
    });

    it('should detect git repo requirement', () => {
      const result = adapter.detectBlockingPrompt('This is not a git repository. Please initialize git.');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('config');
      expect(result.instructions).toContain('git');
    });

    it('should detect destructive operation', () => {
      const result = adapter.detectBlockingPrompt('Delete file.txt? [y/n]');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(false);
    });

    it('should return not detected for normal output', () => {
      const result = adapter.detectBlockingPrompt('Analyzing your code...');

      expect(result.detected).toBe(false);
    });
  });

  describe('detectReady()', () => {
    it('should detect aider> prompt', () => {
      expect(adapter.detectReady('aider> ')).toBe(true);
    });

    it('should detect Aider mention', () => {
      expect(adapter.detectReady('Aider v0.50.0')).toBe(true);
    });

    it('should detect aider ready message', () => {
      expect(adapter.detectReady('aider is ready')).toBe(true);
    });

    it('should detect file added message', () => {
      expect(adapter.detectReady('Added main.py to the chat')).toBe(true);
    });

    it('should detect > prompt', () => {
      expect(adapter.detectReady('> ')).toBe(true);
    });

    it('should return false for loading output', () => {
      expect(adapter.detectReady('Loading repository...')).toBe(false);
    });
  });

  describe('parseOutput()', () => {
    it('should parse complete response', () => {
      const result = adapter.parseOutput('Here are the changes.\n');

      expect(result).not.toBeNull();
      expect(result?.isComplete).toBe(true);
    });

    it('should remove file operation messages', () => {
      const result = adapter.parseOutput('Added main.py to the chat.\nActual content Done.');

      expect(result).not.toBeNull();
      expect(result?.content).not.toContain('Added main.py');
      expect(result?.content).toContain('Actual content');
    });

    it('should detect questions', () => {
      const result = adapter.parseOutput('Should I apply these changes?\n');

      expect(result?.isQuestion).toBe(true);
    });

    it('should return null for incomplete output', () => {
      const result = adapter.parseOutput('Making changes');

      expect(result).toBeNull();
    });
  });

  describe('getPromptPattern()', () => {
    it('should match aider> prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('aider> '.match(pattern)).toBeTruthy();
    });

    it('should match > prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('> '.match(pattern)).toBeTruthy();
    });
  });

  describe('autoResponseRules', () => {
    it('should have file add rule with responseType text', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('add files')
      );

      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.responseType).toBe('text');
      expect(rule?.safe).toBe(true);
    });

    it('should have file create rule with responseType text', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('create')
      );

      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.responseType).toBe('text');
    });

    it('should have apply changes rule with responseType text', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('apply')
      );

      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.responseType).toBe('text');
    });

    it('should have all rules with explicit responseType text', () => {
      for (const rule of adapter.autoResponseRules) {
        expect(rule.responseType).toBe('text');
      }
    });

    it('should match add to chat prompt with [y/n]', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('add files')
      );
      expect(rule?.pattern.test('Add main.py to the chat? [y/n]')).toBe(true);
    });

    it('should match add to chat prompt with [Yes]', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('add files')
      );
      expect(rule?.pattern.test('Add main.py to the chat? [Yes]:')).toBe(true);
    });

    it('should match add to chat prompt with (Y)es/(N)o format', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('add files')
      );
      expect(rule?.pattern.test("Add file to the chat? (Y)es/(N)o/(D)on't ask again [Yes]:")).toBe(true);
    });

    it('should match create new file with [Yes]', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('create')
      );
      expect(rule?.pattern.test('Create new file main.py [Yes]:')).toBe(true);
    });

    it('should match apply changes with [Yes]', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('apply')
      );
      expect(rule?.pattern.test('Apply changes to main.py [Yes]:')).toBe(true);
    });
  });

  describe('getHealthCheckCommand()', () => {
    it('should return version command', () => {
      expect(adapter.getHealthCheckCommand()).toBe('aider --version');
    });
  });
});
