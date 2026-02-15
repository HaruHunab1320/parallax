import { describe, it, expect } from 'vitest';
import { ShellAdapter } from './shell-adapter';

describe('ShellAdapter', () => {
  it('should have correct adapter type', () => {
    const adapter = new ShellAdapter();
    expect(adapter.adapterType).toBe('shell');
    expect(adapter.displayName).toBe('Shell');
  });

  it('should use SHELL env var by default', () => {
    const originalShell = process.env.SHELL;
    process.env.SHELL = '/bin/zsh';

    const adapter = new ShellAdapter();
    expect(adapter.getCommand()).toBe('/bin/zsh');

    process.env.SHELL = originalShell;
  });

  it('should use custom shell', () => {
    const adapter = new ShellAdapter({ shell: '/bin/fish' });
    expect(adapter.getCommand()).toBe('/bin/fish');
  });

  it('should set PS1 with custom prompt', () => {
    const adapter = new ShellAdapter({ prompt: 'custom> ' });
    const env = adapter.getEnv({ name: 'test', type: 'shell' });
    expect(env.PS1).toBe('custom> ');
  });

  it('should return empty args', () => {
    const adapter = new ShellAdapter();
    const args = adapter.getArgs({ name: 'test', type: 'shell' });
    expect(args).toEqual([]);
  });

  it('should never require login', () => {
    const adapter = new ShellAdapter();
    const detection = adapter.detectLogin('any output');
    expect(detection.required).toBe(false);
  });

  it('should never detect blocking prompts', () => {
    const adapter = new ShellAdapter();
    const detection = adapter.detectBlockingPrompt('any output');
    expect(detection.detected).toBe(false);
  });

  it('should detect ready state', () => {
    const adapter = new ShellAdapter({ prompt: 'pty> ' });
    expect(adapter.detectReady('pty> ')).toBe(true);
    expect(adapter.detectReady('$ ')).toBe(true);
    expect(adapter.detectReady('some longer output here')).toBe(true);
    expect(adapter.detectReady('')).toBe(false);
  });

  it('should detect exit', () => {
    const adapter = new ShellAdapter();
    expect(adapter.detectExit('user typed exit')).toEqual({ exited: true, code: 0 });
    expect(adapter.detectExit('normal output')).toEqual({ exited: false });
  });

  it('should parse output', () => {
    const adapter = new ShellAdapter();

    const result = adapter.parseOutput('hello world');
    expect(result).toEqual({
      type: 'response',
      content: 'hello world',
      isComplete: true,
      isQuestion: false,
    });
  });

  it('should return null for empty output', () => {
    const adapter = new ShellAdapter();
    expect(adapter.parseOutput('')).toBeNull();
    expect(adapter.parseOutput('   ')).toBeNull();
  });

  it('should not format input', () => {
    const adapter = new ShellAdapter();
    expect(adapter.formatInput('ls -la')).toBe('ls -la');
  });

  it('should have correct prompt pattern', () => {
    const adapter = new ShellAdapter({ prompt: 'pty> ' });
    const pattern = adapter.getPromptPattern();

    expect(pattern.test('pty> ')).toBe(true);
    expect(pattern.test('$ ')).toBe(true);
    expect(pattern.test('# ')).toBe(true);
    expect(pattern.test('> ')).toBe(true);
  });

  it('should validate installation', async () => {
    const adapter = new ShellAdapter();
    const result = await adapter.validateInstallation();
    expect(result.installed).toBe(true);
  });

  it('should strip ANSI codes from output', () => {
    const adapter = new ShellAdapter();
    const result = adapter.parseOutput('\x1B[32mgreen text\x1B[0m');
    expect(result?.content).toBe('green text');
  });
});
