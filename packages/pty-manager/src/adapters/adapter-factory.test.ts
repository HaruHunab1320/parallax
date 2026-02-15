import { describe, it, expect } from 'vitest';
import { createAdapter } from './adapter-factory';

describe('createAdapter', () => {
  it('should create an adapter from basic config', () => {
    const adapter = createAdapter({
      command: 'my-cli',
    });

    expect(adapter.getCommand()).toBe('my-cli');
    expect(adapter.adapterType).toBe('my-cli');
    expect(adapter.displayName).toBe('my-cli');
  });

  it('should use static args', () => {
    const adapter = createAdapter({
      command: 'cli',
      args: ['--flag', '-v'],
    });

    const args = adapter.getArgs({ name: 'test', type: 'cli' });
    expect(args).toEqual(['--flag', '-v']);
  });

  it('should use dynamic args function', () => {
    const adapter = createAdapter({
      command: 'cli',
      args: (config) => ['--name', config.name],
    });

    const args = adapter.getArgs({ name: 'myname', type: 'cli' });
    expect(args).toEqual(['--name', 'myname']);
  });

  it('should use static env', () => {
    const adapter = createAdapter({
      command: 'cli',
      env: { FOO: 'bar' },
    });

    const env = adapter.getEnv({ name: 'test', type: 'cli' });
    expect(env).toEqual({ FOO: 'bar' });
  });

  it('should use dynamic env function', () => {
    const adapter = createAdapter({
      command: 'cli',
      env: (config) => ({ NAME: config.name }),
    });

    const env = adapter.getEnv({ name: 'myname', type: 'cli' });
    expect(env).toEqual({ NAME: 'myname' });
  });

  it('should detect login from patterns', () => {
    const adapter = createAdapter({
      command: 'cli',
      loginDetection: {
        patterns: [/please log in/i, /auth required/i],
        extractUrl: (output) => output.match(/https:\/\/[^\s]+/)?.[0] || null,
      },
    });

    const detection1 = adapter.detectLogin('Please log in to continue');
    expect(detection1.required).toBe(true);

    const detection2 = adapter.detectLogin('Auth required at https://example.com/login');
    expect(detection2.required).toBe(true);
    expect(detection2.url).toBe('https://example.com/login');

    const detection3 = adapter.detectLogin('Welcome back!');
    expect(detection3.required).toBe(false);
  });

  it('should detect ready state from indicators', () => {
    const adapter = createAdapter({
      command: 'cli',
      readyIndicators: [/ready>/i, /\$ $/],
    });

    expect(adapter.detectReady('System ready>')).toBe(true);
    expect(adapter.detectReady('loading...')).toBe(false);
    expect(adapter.detectReady('prompt$ ')).toBe(true);
  });

  it('should build auto-response rules from blocking prompts', () => {
    const adapter = createAdapter({
      command: 'cli',
      blockingPrompts: [
        { pattern: /\[Y\/n\]/i, type: 'config', autoResponse: 'Y', description: 'Confirm' },
        { pattern: /accept\?/i, type: 'tos' }, // No auto-response
      ],
    });

    expect(adapter.autoResponseRules).toHaveLength(1);
    expect(adapter.autoResponseRules![0].response).toBe('Y');
    expect(adapter.autoResponseRules![0].type).toBe('config');
  });

  it('should detect blocking prompts', () => {
    const adapter = createAdapter({
      command: 'cli',
      blockingPrompts: [
        { pattern: /continue\?/i, type: 'config', autoResponse: 'yes' },
      ],
    });

    const detection = adapter.detectBlockingPrompt!('Do you want to continue?');
    expect(detection.detected).toBe(true);
    expect(detection.type).toBe('config');
    expect(detection.suggestedResponse).toBe('yes');
    expect(detection.canAutoRespond).toBe(true);
  });

  it('should use custom parseOutput', () => {
    const adapter = createAdapter({
      command: 'cli',
      parseOutput: (output) => ({
        type: 'response',
        content: output.toUpperCase(),
        isComplete: true,
        isQuestion: false,
      }),
    });

    const parsed = adapter.parseOutput('hello');
    expect(parsed).not.toBeNull();
    expect(parsed!.content).toBe('HELLO');
  });

  it('should use custom formatInput', () => {
    const adapter = createAdapter({
      command: 'cli',
      formatInput: (msg) => `CMD: ${msg}`,
    });

    expect(adapter.formatInput('test')).toBe('CMD: test');
  });

  it('should use custom promptPattern', () => {
    const adapter = createAdapter({
      command: 'cli',
      promptPattern: /mycli>/,
    });

    expect(adapter.getPromptPattern().source).toBe('mycli>');
  });

  it('should detect exit from custom indicators', () => {
    const adapter = createAdapter({
      command: 'cli',
      exitIndicators: [
        {
          pattern: /exited with (\d+)/,
          codeExtractor: (match) => parseInt(match[1], 10),
        },
      ],
    });

    const exit = adapter.detectExit('process exited with 42');
    expect(exit.exited).toBe(true);
    expect(exit.code).toBe(42);
  });
});
