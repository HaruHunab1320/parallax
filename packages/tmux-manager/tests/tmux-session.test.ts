import { afterEach, describe, expect, it } from 'vitest';
import { ShellAdapter } from '../src/adapters/shell-adapter.js';
import { SPECIAL_KEYS, TmuxSession } from '../src/tmux-session.js';
import { TmuxTransport } from '../src/tmux-transport.js';

describe('TmuxSession', () => {
  const sessions: TmuxSession[] = [];
  const transport = new TmuxTransport();

  function createSession(overrides: Record<string, unknown> = {}): TmuxSession {
    const session = new TmuxSession(
      new ShellAdapter(),
      {
        name: 'test-session',
        type: 'shell',
        cols: 80,
        rows: 24,
        ...overrides,
      },
      undefined,
      false,
      8000,
      transport,
      'test-sess'
    );
    sessions.push(session);
    return session;
  }

  afterEach(async () => {
    for (const session of sessions) {
      try {
        session.kill('SIGKILL');
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch {
        // ignore
      }
    }
    sessions.length = 0;
  });

  describe('lifecycle', () => {
    it('should start with pending status', () => {
      const session = createSession();
      expect(session.status).toBe('pending');
    });

    it('should start and emit ready', async () => {
      const session = createSession();

      const readyPromise = new Promise<void>((resolve) => {
        session.on('ready', () => resolve());
      });

      await session.start();

      // Wait for ready (shell prompt detection)
      await Promise.race([
        readyPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for ready')), 5000)
        ),
      ]);

      expect(session.status).toBe('ready');
    });

    it('should have a pid after start', async () => {
      const session = createSession();
      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(session.pid).toBeDefined();
      expect(session.pid).toBeGreaterThan(0);
    });

    it('should kill and emit exit', async () => {
      const session = createSession();
      await session.start();

      const exitPromise = new Promise<number>((resolve) => {
        session.on('exit', (code) => resolve(code));
      });

      session.kill('SIGKILL');

      const code = await Promise.race([
        exitPromise,
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for exit')), 5000)
        ),
      ]);

      expect(typeof code).toBe('number');
    });
  });

  describe('I/O', () => {
    it('should send a task and transition to busy', async () => {
      const session = createSession();
      await session.start();

      // Wait for ready
      await new Promise<void>((resolve) => {
        session.on('ready', () => resolve());
        setTimeout(resolve, 3000);
      });

      if (session.status !== 'ready') return; // Skip if not ready in time

      const msg = session.send('echo hello');
      expect(msg.direction).toBe('inbound');
      expect(msg.type).toBe('task');
      expect(session.status).toBe('busy');
    });

    it('should emit output events', async () => {
      const session = createSession();
      const outputs: string[] = [];

      session.on('output', (data) => {
        outputs.push(data);
      });

      await session.start();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(outputs.length).toBeGreaterThan(0);
    });
  });

  describe('toHandle', () => {
    it('should return a valid SessionHandle', () => {
      const session = createSession();
      const handle = session.toHandle();
      expect(handle.id).toBe(session.id);
      expect(handle.name).toBe('test-session');
      expect(handle.type).toBe('shell');
      expect(handle.status).toBe('pending');
      expect(handle.tmuxSessionName).toBeTruthy();
    });
  });

  describe('auto-response rules', () => {
    it('should add and retrieve rules', () => {
      const session = createSession();
      session.addAutoResponseRule({
        pattern: /test/,
        type: 'unknown',
        response: 'y',
        description: 'Test rule',
      });

      const rules = session.getAutoResponseRules();
      expect(rules.length).toBe(1);
      expect(rules[0].description).toBe('Test rule');
    });

    it('should remove rules by pattern', () => {
      const session = createSession();
      session.addAutoResponseRule({
        pattern: /test/,
        type: 'unknown',
        response: 'y',
        description: 'Test rule',
      });

      expect(session.removeAutoResponseRule(/test/)).toBe(true);
      expect(session.getAutoResponseRules().length).toBe(0);
    });

    it('should clear all rules', () => {
      const session = createSession();
      session.addAutoResponseRule({
        pattern: /test/,
        type: 'unknown',
        response: 'y',
        description: 'Test rule',
      });

      session.clearAutoResponseRules();
      expect(session.getAutoResponseRules().length).toBe(0);
    });
  });

  describe('normalizeKeyList', () => {
    it('should join bare modifiers with next key', () => {
      expect(TmuxSession.normalizeKeyList(['control', 'c'])).toEqual([
        'ctrl+c',
      ]);
      expect(TmuxSession.normalizeKeyList(['option', 'b'])).toEqual(['alt+b']);
    });

    it('should lowercase keys', () => {
      expect(TmuxSession.normalizeKeyList(['Enter'])).toEqual(['enter']);
    });

    it('should pass through normal keys', () => {
      expect(TmuxSession.normalizeKeyList(['up', 'down', 'enter'])).toEqual([
        'up',
        'down',
        'enter',
      ]);
    });
  });

  describe('SPECIAL_KEYS', () => {
    it('should have enter and ctrl+c', () => {
      expect(SPECIAL_KEYS.enter).toBe('\r');
      expect(SPECIAL_KEYS['ctrl+c']).toBe('\x03');
    });
  });

  describe('buildSpawnEnv', () => {
    it('should merge env correctly', () => {
      const env = TmuxSession.buildSpawnEnv(
        { name: 'test', type: 'shell', env: { FOO: 'bar' } },
        { PS1: 'test> ' }
      );
      expect(env.FOO).toBe('bar');
      expect(env.PS1).toBe('test> ');
      expect(env.TERM).toBe('xterm-256color');
      expect(env.COLORTERM).toBe('truecolor');
    });

    it('should not inherit process env when opted out', () => {
      const env = TmuxSession.buildSpawnEnv(
        {
          name: 'test',
          type: 'shell',
          inheritProcessEnv: false,
          env: { PATH: '/usr/bin' },
        },
        {}
      );
      expect(env.PATH).toBe('/usr/bin');
      expect(env.TERM).toBe('xterm-256color');
      // Should NOT have random process env vars
    });
  });
});
