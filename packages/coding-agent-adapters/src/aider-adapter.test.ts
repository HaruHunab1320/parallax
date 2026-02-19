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

    it('should detect OpenRouter OAuth login offer (onboarding.py)', () => {
      const result = adapter.detectLogin('Login to OpenRouter or create a free account?');

      expect(result.required).toBe(true);
      expect(result.type).toBe('oauth');
    });

    it('should detect OpenRouter browser flow (onboarding.py:311)', () => {
      const result = adapter.detectLogin('Please open this URL in your browser to connect Aider with OpenRouter: https://openrouter.ai/auth');

      expect(result.required).toBe(true);
      expect(result.type).toBe('browser');
      expect(result.url).toBe('https://openrouter.ai/auth');
    });

    it('should detect "waiting for browser" auth flow', () => {
      const result = adapter.detectLogin('Waiting up to 5 minutes for you to finish in the browser...');

      expect(result.required).toBe(true);
      expect(result.type).toBe('browser');
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

    it('should detect OpenRouter OAuth as login blocking prompt', () => {
      const result = adapter.detectBlockingPrompt('Login to OpenRouter or create a free account?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('login');
      expect(result.canAutoRespond).toBe(false);
    });

    it('should detect model selection', () => {
      const result = adapter.detectBlockingPrompt('Which model would you like to use?');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('model_select');
    });

    it('should detect confirmation validation error (io.py:897)', () => {
      const result = adapter.detectBlockingPrompt('Please answer with one of: yes, no, skip, all');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('unknown');
      expect(result.canAutoRespond).toBe(false);
    });

    it('should detect destructive operation with [y/n]', () => {
      const result = adapter.detectBlockingPrompt('Delete file.txt? [y/n]');

      expect(result.detected).toBe(true);
      expect(result.type).toBe('permission');
      expect(result.canAutoRespond).toBe(false);
    });

    it('should detect destructive operation with (Y)es/(N)o format', () => {
      const result = adapter.detectBlockingPrompt('Overwrite existing file? (Y)es/(N)o [No]:');

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
    it('should detect ask> prompt (io.py:545)', () => {
      expect(adapter.detectReady('ask> ')).toBe(true);
    });

    it('should detect code> prompt', () => {
      expect(adapter.detectReady('code> ')).toBe(true);
    });

    it('should detect architect> prompt', () => {
      expect(adapter.detectReady('architect> ')).toBe(true);
    });

    it('should detect help> prompt', () => {
      expect(adapter.detectReady('help> ')).toBe(true);
    });

    it('should detect multi> prompt', () => {
      expect(adapter.detectReady('multi> ')).toBe(true);
    });

    it('should detect "code multi>" prompt', () => {
      expect(adapter.detectReady('code multi> ')).toBe(true);
    });

    it('should detect startup banner "Aider v{version}" (base_coder.py:209)', () => {
      expect(adapter.detectReady('Aider v0.82.0')).toBe(true);
    });

    it('should detect Readonly:/Editable: file list (io.py:1149)', () => {
      expect(adapter.detectReady('Readonly: src/main.py')).toBe(true);
      expect(adapter.detectReady('Editable: src/main.py')).toBe(true);
    });

    it('should detect aider> prompt (legacy)', () => {
      expect(adapter.detectReady('aider> ')).toBe(true);
    });

    it('should detect file added message', () => {
      expect(adapter.detectReady('Added main.py to the chat')).toBe(true);
    });

    it('should detect > prompt', () => {
      expect(adapter.detectReady('> ')).toBe(true);
    });

    it('should NOT detect ready when OAuth login is shown', () => {
      expect(adapter.detectReady('Login to OpenRouter or create a free account?\n> ')).toBe(false);
    });

    it('should NOT detect ready when browser auth is in progress', () => {
      expect(adapter.detectReady('Waiting up to 5 minutes for you to finish in the browser...')).toBe(false);
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

    it('should match ask> prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('ask> '.match(pattern)).toBeTruthy();
    });

    it('should match code> prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('code> '.match(pattern)).toBeTruthy();
    });

    it('should match architect> prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('architect> '.match(pattern)).toBeTruthy();
    });

    it('should match "code multi>" prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('code multi> '.match(pattern)).toBeTruthy();
    });

    it('should match multi> prompt', () => {
      const pattern = adapter.getPromptPattern();
      expect('multi> '.match(pattern)).toBeTruthy();
    });
  });

  describe('autoResponseRules', () => {
    it('should have all rules with explicit responseType text', () => {
      for (const rule of adapter.autoResponseRules) {
        expect(rule.responseType).toBe('text');
      }
    });

    // ── Decline rules ───────────────────────────────────────────────────
    it('should decline telemetry opt-in (main.py:650)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('telemetry')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('n');
      expect(rule?.once).toBe(true);
      expect(rule?.pattern.test('Allow collection of anonymous analytics to help improve aider?')).toBe(true);
    });

    it('should decline release notes offer (main.py:1107)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('release notes')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('n');
      expect(rule?.once).toBe(true);
      expect(rule?.pattern.test("Would you like to see what's new in this version?")).toBe(true);
    });

    it('should decline bug report (report.py:70)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('bug report')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('n');
      expect(rule?.pattern.test('Open a GitHub Issue pre-filled with the above error in your browser? (Y/n)')).toBe(true);
    });

    // ── File / edit operations ──────────────────────────────────────────
    it('should accept add file to chat (base_coder.py:1773)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('add files to chat')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Add main.py to the chat?')).toBe(true);
      expect(rule?.pattern.test("Add file to the chat? (Y)es/(N)o/(D)on't ask again [Yes]:")).toBe(true);
    });

    it('should accept add URL to chat (base_coder.py:977)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('url')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Add URL to the chat?')).toBe(true);
    });

    it('should accept create new file (base_coder.py:2207)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('create new files')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Create new file?')).toBe(true);
    });

    it('should accept allow edits to file (base_coder.py:2227)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('edits to file not yet')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Allow edits to file that has not been added to the chat?')).toBe(true);
    });

    it('should accept architect mode "Edit the files?" (architect_coder.py:17)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('architect')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Edit the files?')).toBe(true);
    });

    // ── Shell operations ────────────────────────────────────────────────
    it('should accept run shell command (base_coder.py:2455)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('run shell')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Run shell command?')).toBe(true);
      expect(rule?.pattern.test('Run shell commands?')).toBe(true);
    });

    it('should accept add command output to chat (base_coder.py:2480)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('shell command output')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Add command output to the chat?')).toBe(true);
    });

    it('should accept add tokens of command output (commands.py:1029)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('/run command output')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Add 2.5k tokens of command output to the chat?')).toBe(true);
    });

    // ── Setup / maintenance ─────────────────────────────────────────────
    it('should accept git repo creation (main.py:123)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('git repo')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.once).toBe(true);
      expect(rule?.pattern.test("No git repo found, create one to track aider's changes (recommended)?")).toBe(true);
    });

    it('should accept .gitignore update (main.py:191)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('gitignore')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.once).toBe(true);
      expect(rule?.pattern.test('Add .aider* to .gitignore (recommended)?')).toBe(true);
    });

    it('should accept pip install (utils.py:317)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('python dependencies')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Run pip install?')).toBe(true);
    });

    it('should accept playwright install (scrape.py:62)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('playwright')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Install playwright?')).toBe(true);
    });

    // ── Other safe confirmations ────────────────────────────────────────
    it('should accept lint error fix (commands.py:389)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('lint')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Fix lint errors in main.py?')).toBe(true);
    });

    it('should accept context limit continuation (base_coder.py:1415)', () => {
      const rule = adapter.autoResponseRules.find(r =>
        r.description.toLowerCase().includes('context limit')
      );
      expect(rule).toBeDefined();
      expect(rule?.response).toBe('y');
      expect(rule?.pattern.test('Try to proceed anyway?')).toBe(true);
    });
  });

  describe('detectExit()', () => {
    it('should detect Ctrl+C exit warning (base_coder.py:994)', () => {
      const result = adapter.detectExit('^C again to exit');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(130);
    });

    it('should detect Ctrl+C KeyboardInterrupt (base_coder.py:998)', () => {
      const result = adapter.detectExit('^C KeyboardInterrupt');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(130);
    });

    it('should detect version update exit (versioncheck.py:58)', () => {
      const result = adapter.detectExit('Re-run aider to use new version.');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(0);
    });

    it('should detect command not found (from base)', () => {
      const result = adapter.detectExit('Command not found: aider');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(127);
    });

    it('should not detect exit for normal output', () => {
      const result = adapter.detectExit('Working on your changes...');

      expect(result.exited).toBe(false);
    });
  });

  describe('getHealthCheckCommand()', () => {
    it('should return version command', () => {
      expect(adapter.getHealthCheckCommand()).toBe('aider --version');
    });
  });
});
