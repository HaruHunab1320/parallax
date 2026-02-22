import { describe, it, expect, vi } from 'vitest';
import { BaseCLIAdapter } from './base-adapter';
import type { SpawnConfig, ParsedOutput, LoginDetection } from '../types';

// Concrete implementation for testing
class TestAdapter extends BaseCLIAdapter {
  readonly adapterType = 'test';
  readonly displayName = 'Test Adapter';

  getCommand(): string {
    return 'test-cli';
  }

  getArgs(_config: SpawnConfig): string[] {
    return ['--test'];
  }

  getEnv(_config: SpawnConfig): Record<string, string> {
    return { TEST: 'true' };
  }

  detectLogin(output: string): LoginDetection {
    if (output.includes('login required')) {
      return { required: true, type: 'browser', instructions: 'Please login' };
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
      isQuestion: output.includes('?'),
    };
  }

  getPromptPattern(): RegExp {
    return /test>/;
  }
}

describe('BaseCLIAdapter', () => {
  it('should implement abstract methods', () => {
    const adapter = new TestAdapter();

    expect(adapter.adapterType).toBe('test');
    expect(adapter.displayName).toBe('Test Adapter');
    expect(adapter.getCommand()).toBe('test-cli');
    expect(adapter.getArgs({ name: 'x', type: 'test' })).toEqual(['--test']);
    expect(adapter.getEnv({ name: 'x', type: 'test' })).toEqual({ TEST: 'true' });
  });

  it('should detect login from subclass implementation', () => {
    const adapter = new TestAdapter();

    expect(adapter.detectLogin('login required')).toEqual({
      required: true,
      type: 'browser',
      instructions: 'Please login',
    });

    expect(adapter.detectLogin('welcome')).toEqual({ required: false });
  });

  it('should detect exit for common patterns', () => {
    const adapter = new TestAdapter();

    expect(adapter.detectExit('Process exited with code 0')).toEqual({
      exited: true,
      code: 0,
    });

    expect(adapter.detectExit('Process exited with code 1')).toEqual({
      exited: true,
      code: 1,
    });

    expect(adapter.detectExit('Command not found')).toEqual({
      exited: true,
      code: 127,
      error: 'Command not found',
    });

    expect(adapter.detectExit('normal output')).toEqual({ exited: false });
  });

  it('should detect blocking prompts - update prompts', () => {
    const adapter = new TestAdapter();

    const detection = adapter.detectBlockingPrompt('Update available now! [Y/n]');
    expect(detection.detected).toBe(true);
    expect(detection.type).toBe('update');
    expect(detection.canAutoRespond).toBe(true);
    expect(detection.suggestedResponse).toBe('n');
  });

  it('should detect blocking prompts - TOS', () => {
    const adapter = new TestAdapter();

    const detection = adapter.detectBlockingPrompt('Accept terms of service? [Y/n]');
    expect(detection.detected).toBe(true);
    expect(detection.type).toBe('tos');
    expect(detection.canAutoRespond).toBe(false);
  });

  it('should detect blocking prompts - model selection', () => {
    const adapter = new TestAdapter();

    const detection = adapter.detectBlockingPrompt('Choose a model:');
    expect(detection.detected).toBe(true);
    expect(detection.type).toBe('model_select');
    expect(detection.canAutoRespond).toBe(false);
  });

  it('should detect blocking prompts - project selection', () => {
    const adapter = new TestAdapter();

    const detection = adapter.detectBlockingPrompt('Select a project:');
    expect(detection.detected).toBe(true);
    expect(detection.type).toBe('project_select');
    expect(detection.canAutoRespond).toBe(false);
  });

  it('should detect blocking prompts - login (from subclass)', () => {
    const adapter = new TestAdapter();

    const detection = adapter.detectBlockingPrompt('login required');
    expect(detection.detected).toBe(true);
    expect(detection.type).toBe('login');
    expect(detection.canAutoRespond).toBe(false);
  });

  it('should detect unknown y/n prompts', () => {
    const adapter = new TestAdapter();

    const detection = adapter.detectBlockingPrompt('Continue with something? [y/n]');
    expect(detection.detected).toBe(true);
    expect(detection.type).toBe('unknown');
    expect(detection.options).toEqual(['y', 'n']);
  });

  it('should not detect blocking prompts for normal output', () => {
    const adapter = new TestAdapter();

    const detection = adapter.detectBlockingPrompt('Processing...');
    expect(detection.detected).toBe(false);
  });

  it('should format input with default implementation', () => {
    const adapter = new TestAdapter();
    expect(adapter.formatInput('hello')).toBe('hello');
  });

  it('should detect questions in output', () => {
    const adapter = new TestAdapter();

    expect(adapter.parseOutput('What is your name?')?.isQuestion).toBe(true);
    expect(adapter.parseOutput('Hello world')?.isQuestion).toBe(false);
  });

  it('should strip ANSI codes', () => {
    const adapter = new TestAdapter();

    // parseOutput uses stripAnsi internally
    const result = adapter.parseOutput('\x1B[31mred\x1B[0m text');
    expect(result?.content).toBe('\x1B[31mred\x1B[0m text'.trim());
    // Note: TestAdapter doesn't strip ANSI in parseOutput, but detectBlockingPrompt does

    const detection = adapter.detectBlockingPrompt('\x1B[31mUpdate available\x1B[0m [Y/n]');
    expect(detection.detected).toBe(true);
  });

  it('should have empty auto-response rules by default', () => {
    const adapter = new TestAdapter();
    expect(adapter.autoResponseRules).toEqual([]);
  });

  it('should strip OSC sequences from output', () => {
    const adapter = new TestAdapter();

    // OSC hyperlink: \x1b]8;;url\x07visible\x1b]8;;\x07
    // The OSC wrappers should be stripped, visible text preserved
    const input = '\x1b]8;;https://example.com\x07Click here\x1b]8;;\x07 to continue';
    const detection = adapter.detectBlockingPrompt(input + '?');

    // The stripped output should contain visible text
    expect(detection.detected).toBe(true);
    // Verify OSC payload is gone from the prompt
    expect(detection.prompt).not.toContain('https://example.com');
    expect(detection.prompt).toContain('Click here');
    expect(detection.prompt).toContain('to continue');
  });

  it('should strip OSC window title sequences', () => {
    const adapter = new TestAdapter();

    // OSC window title: \x1b]0;Title\x07
    const input = 'Hello \x1b]0;Window Title\x07World';
    const detection = adapter.detectBlockingPrompt(input + '?');

    expect(detection.detected).toBe(true);
    expect(detection.prompt).not.toContain('Window Title');
    expect(detection.prompt).toContain('Hello');
    expect(detection.prompt).toContain('World');
  });
});
