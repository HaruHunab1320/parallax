/**
 * Base Coding Adapter Tests
 */

import { describe, it, expect } from 'vitest';
import { BaseCodingAdapter, type InstallationInfo, type AgentCredentials } from './base-coding-adapter';
import type { SpawnConfig, ParsedOutput, LoginDetection } from 'pty-manager';

// Concrete implementation for testing
class TestAdapter extends BaseCodingAdapter {
  readonly adapterType = 'test';
  readonly displayName = 'Test Adapter';

  readonly installation: InstallationInfo = {
    command: 'npm install -g test-cli',
    alternatives: ['brew install test-cli'],
    docsUrl: 'https://test-cli.dev/docs',
    minVersion: '1.0.0',
  };

  getCommand(): string {
    return 'test-cli';
  }

  getArgs(config: SpawnConfig): string[] {
    const args: string[] = [];
    if (config.workdir) {
      args.push('--cwd', config.workdir);
    }
    return args;
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    const env: Record<string, string> = {};
    const creds = this.getCredentials(config);
    if (creds.anthropicKey) {
      env.TEST_API_KEY = creds.anthropicKey;
    }
    return env;
  }

  detectLogin(output: string): LoginDetection {
    if (output.includes('login required')) {
      return { required: true, type: 'api_key', instructions: 'Please login' };
    }
    return { required: false };
  }

  detectReady(output: string): boolean {
    return output.includes('ready>');
  }

  parseOutput(output: string): ParsedOutput | null {
    if (!output.trim()) return null;
    return {
      type: 'response',
      content: output.trim(),
      isComplete: true,
      isQuestion: false,
    };
  }

  getPromptPattern(): RegExp {
    return /test>\s*$/;
  }

  // Expose protected methods for testing
  public testGetCredentials(config: SpawnConfig): AgentCredentials {
    return this.getCredentials(config);
  }

  public testIsResponseComplete(output: string): boolean {
    return this.isResponseComplete(output);
  }

  public testExtractContent(output: string, pattern: RegExp): string {
    return this.extractContent(output, pattern);
  }
}

describe('BaseCodingAdapter', () => {
  const adapter = new TestAdapter();

  describe('usesTuiMenus', () => {
    it('should return true for coding agent adapters', () => {
      expect(adapter.usesTuiMenus).toBe(true);
    });
  });

  describe('installation info', () => {
    it('should have installation command', () => {
      expect(adapter.installation.command).toBe('npm install -g test-cli');
    });

    it('should have alternatives', () => {
      expect(adapter.installation.alternatives).toContain('brew install test-cli');
    });

    it('should have docs URL', () => {
      expect(adapter.installation.docsUrl).toBe('https://test-cli.dev/docs');
    });

    it('should have min version', () => {
      expect(adapter.installation.minVersion).toBe('1.0.0');
    });
  });

  describe('getInstallInstructions()', () => {
    it('should return formatted instructions', () => {
      const instructions = adapter.getInstallInstructions();

      expect(instructions).toContain('Test Adapter Installation');
      expect(instructions).toContain('npm install -g test-cli');
      expect(instructions).toContain('brew install test-cli');
      expect(instructions).toContain('https://test-cli.dev/docs');
      expect(instructions).toContain('1.0.0');
    });
  });

  describe('detectExit()', () => {
    it('should detect command not found and include install instructions', () => {
      const result = adapter.detectExit('bash: test-cli: command not found');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(127);
      expect(result.error).toContain('Test Adapter CLI not found');
      expect(result.error).toContain('npm install -g test-cli');
      expect(result.error).toContain('https://test-cli.dev/docs');
    });

    it('should detect Command not found (capital C)', () => {
      const result = adapter.detectExit('Command not found: test-cli');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(127);
    });

    it('should detect process exit code', () => {
      const result = adapter.detectExit('Process exited with code 1');

      expect(result.exited).toBe(true);
      expect(result.code).toBe(1);
    });

    it('should return not exited for normal output', () => {
      const result = adapter.detectExit('Hello world');

      expect(result.exited).toBe(false);
    });
  });

  describe('getCredentials()', () => {
    it('should extract credentials from adapterConfig', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'test',
        adapterConfig: {
          anthropicKey: 'sk-ant-test',
          openaiKey: 'sk-openai-test',
        },
      };

      const creds = adapter.testGetCredentials(config);

      expect(creds.anthropicKey).toBe('sk-ant-test');
      expect(creds.openaiKey).toBe('sk-openai-test');
    });

    it('should return empty object when no adapterConfig', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'test',
      };

      const creds = adapter.testGetCredentials(config);

      expect(creds).toEqual({});
    });
  });

  describe('isResponseComplete()', () => {
    it('should detect completion with newline prompt', () => {
      expect(adapter.testIsResponseComplete('Hello\n> ')).toBe(true);
    });

    it('should detect completion with Done.', () => {
      expect(adapter.testIsResponseComplete('Task Done.')).toBe(true);
    });

    it('should detect completion with completed', () => {
      expect(adapter.testIsResponseComplete('Task completed successfully')).toBe(true);
    });

    it('should detect completion with finished', () => {
      expect(adapter.testIsResponseComplete('finished processing')).toBe(true);
    });

    it('should detect completion with code block end', () => {
      expect(adapter.testIsResponseComplete('code here\n```')).toBe(true);
    });

    it('should return false for incomplete output', () => {
      expect(adapter.testIsResponseComplete('still working')).toBe(false);
    });
  });

  describe('extractContent()', () => {
    it('should remove prompt patterns', () => {
      const content = adapter.testExtractContent('test> hello\ntest> world', /^.*test>\s*/gim);
      expect(content).toBe('hello\nworld');
    });

    it('should remove status lines', () => {
      const content = adapter.testExtractContent('Thinking...\nActual content', /^$/gm);
      expect(content).toBe('Actual content');
    });

    it('should trim whitespace', () => {
      const content = adapter.testExtractContent('  hello world  ', /^$/gm);
      expect(content).toBe('hello world');
    });
  });

  describe('getEnv()', () => {
    it('should set env vars from credentials', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'test',
        adapterConfig: {
          anthropicKey: 'sk-test-key',
        },
      };

      const env = adapter.getEnv(config);

      expect(env.TEST_API_KEY).toBe('sk-test-key');
    });
  });

  describe('getArgs()', () => {
    it('should include workdir when specified', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'test',
        workdir: '/path/to/project',
      };

      const args = adapter.getArgs(config);

      expect(args).toContain('--cwd');
      expect(args).toContain('/path/to/project');
    });

    it('should return empty array when no workdir', () => {
      const config: SpawnConfig = {
        name: 'test',
        type: 'test',
      };

      const args = adapter.getArgs(config);

      expect(args).toEqual([]);
    });
  });
});
