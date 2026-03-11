import { describe, it, expect } from 'vitest';
import { BaseCLIAdapter } from '../src/adapters/base-adapter.js';
import type { SpawnConfig, ParsedOutput, LoginDetection } from '../src/types.js';

class TestAdapter extends BaseCLIAdapter {
  readonly adapterType = 'test';
  readonly displayName = 'Test';

  getCommand(): string { return 'echo'; }
  getArgs(_config: SpawnConfig): string[] { return []; }
  getEnv(_config: SpawnConfig): Record<string, string> { return {}; }
  detectLogin(_output: string): LoginDetection { return { required: false }; }
  detectReady(output: string): boolean { return output.includes('ready>'); }
  parseOutput(output: string): ParsedOutput | null {
    const cleaned = output.trim();
    if (!cleaned) return null;
    return { type: 'response', content: cleaned, isComplete: true, isQuestion: false };
  }
  getPromptPattern(): RegExp { return /ready>\s*$/m; }
}

describe('BaseCLIAdapter', () => {
  const adapter = new TestAdapter();

  it('should detect common exit patterns', () => {
    expect(adapter.detectExit('Process exited with code 1').exited).toBe(true);
    expect(adapter.detectExit('Process exited with code 1').code).toBe(1);
    expect(adapter.detectExit('command not found').exited).toBe(true);
    expect(adapter.detectExit('running...').exited).toBe(false);
  });

  it('should detect blocking prompts', () => {
    expect(adapter.detectBlockingPrompt('update available [y/n]').detected).toBe(true);
    expect(adapter.detectBlockingPrompt('update available [y/n]').type).toBe('update');
    expect(adapter.detectBlockingPrompt('nothing special here').detected).toBe(false);
  });

  it('should detect y/n prompts', () => {
    const result = adapter.detectBlockingPrompt('Continue? [Y/n]');
    expect(result.detected).toBe(true);
    expect(result.options).toContain('y');
  });

  it('should detect permission prompts', () => {
    const result = adapter.detectBlockingPrompt('Do you trust this tool?');
    expect(result.detected).toBe(true);
    expect(result.type).toBe('permission');
  });

  it('should detect question prompts', () => {
    const result = adapter.detectBlockingPrompt('What would you like to do?');
    expect(result.detected).toBe(true);
  });

  it('should default task completion to detectReady', () => {
    expect(adapter.detectTaskComplete('ready> ')).toBe(true);
    expect(adapter.detectTaskComplete('working...')).toBe(false);
  });

  it('should format input as passthrough', () => {
    expect(adapter.formatInput('hello')).toBe('hello');
  });
});
