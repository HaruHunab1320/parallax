import { describe, expect, it } from 'vitest';
import { ShellAdapter } from '../src/adapters/shell-adapter.js';
import type { SpawnConfig } from '../src/types.js';

const dummyConfig: SpawnConfig = { name: 'test', type: 'shell' };

describe('ShellAdapter', () => {
  it('should use default shell and prompt', () => {
    const adapter = new ShellAdapter();
    expect(adapter.adapterType).toBe('shell');
    expect(adapter.displayName).toBe('Shell');
    expect(adapter.getCommand()).toBeTruthy();
    // Args depend on the default shell (zsh gets -f, bash gets --norc --noprofile)
    const args = adapter.getArgs(dummyConfig);
    expect(Array.isArray(args)).toBe(true);
    expect(adapter.getEnv(dummyConfig)).toEqual({
      PS1: 'pty> ',
      PROMPT: 'pty> ',
    });
  });

  it('should accept custom shell and prompt', () => {
    const adapter = new ShellAdapter({ shell: '/bin/zsh', prompt: 'test$ ' });
    expect(adapter.getCommand()).toBe('/bin/zsh');
    expect(adapter.getEnv(dummyConfig)).toEqual({
      PS1: 'test$ ',
      PROMPT: 'test$ ',
    });
    expect(adapter.getArgs(dummyConfig)).toEqual(['-f']); // zsh gets -f flag
  });

  it('should detect ready from prompt', () => {
    const adapter = new ShellAdapter();
    expect(adapter.detectReady('pty> ')).toBe(true);
    expect(adapter.detectReady('$ ')).toBe(true);
    expect(adapter.detectReady('Loading...')).toBe(false);
  });

  it('should reject continuation prompts', () => {
    const adapter = new ShellAdapter();
    expect(adapter.detectReady('dquote> ')).toBe(false);
    expect(adapter.detectReady('heredoc> ')).toBe(false);
    expect(adapter.detectReady('quote> ')).toBe(false);
  });

  it('should not require login', () => {
    const adapter = new ShellAdapter();
    expect(adapter.detectLogin('anything')).toEqual({ required: false });
  });

  it('should detect exit', () => {
    const adapter = new ShellAdapter();
    expect(adapter.detectExit('exit').exited).toBe(true);
    expect(adapter.detectExit('running...').exited).toBe(false);
  });

  it('should parse output', () => {
    const adapter = new ShellAdapter();
    const parsed = adapter.parseOutput('hello world');
    expect(parsed).not.toBeNull();
    expect(parsed!.content).toBe('hello world');
    expect(parsed!.type).toBe('response');
  });

  it('should validate installation', async () => {
    const adapter = new ShellAdapter();
    const result = await adapter.validateInstallation();
    expect(result.installed).toBe(true);
  });
});
