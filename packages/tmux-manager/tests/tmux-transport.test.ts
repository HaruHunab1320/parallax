import { describe, it, expect, afterEach } from 'vitest';
import { TmuxTransport, TMUX_KEY_MAP } from '../src/tmux-transport.js';

describe('TmuxTransport', () => {
  const transport = new TmuxTransport();
  const testSessions: string[] = [];

  function createTestSession(name: string): string {
    const sessionName = `test-tmux-${name}-${Date.now()}`;
    testSessions.push(sessionName);
    return sessionName;
  }

  afterEach(() => {
    // Clean up any test sessions
    for (const name of testSessions) {
      try {
        transport.kill(name);
      } catch {
        // ignore
      }
    }
    testSessions.length = 0;
  });

  describe('spawn and lifecycle', () => {
    it('should spawn a tmux session', () => {
      const name = createTestSession('spawn');
      transport.spawn(name, {
        command: '/bin/bash',
        args: [],
        cwd: '/tmp',
        env: { PS1: 'test> ' },
        cols: 80,
        rows: 24,
        historyLimit: 1000,
      });

      expect(transport.isAlive(name)).toBe(true);
    });

    it('should kill a tmux session', () => {
      const name = createTestSession('kill');
      transport.spawn(name, {
        command: '/bin/bash',
        args: [],
        cwd: '/tmp',
        env: {},
        cols: 80,
        rows: 24,
        historyLimit: 1000,
      });

      transport.kill(name);
      expect(transport.isAlive(name)).toBe(false);
    });

    it('should report non-existent session as not alive', () => {
      expect(transport.isAlive('nonexistent-session-xyz')).toBe(false);
    });
  });

  describe('I/O', () => {
    it('should send text and capture pane content', async () => {
      const name = createTestSession('io');
      transport.spawn(name, {
        command: '/bin/bash',
        args: [],
        cwd: '/tmp',
        env: { PS1: 'test> ' },
        cols: 80,
        rows: 24,
        historyLimit: 1000,
      });

      // Wait for shell to start
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send a command
      transport.sendText(name, 'echo hello-tmux-test');
      transport.sendKey(name, 'enter');

      // Wait for output
      await new Promise(resolve => setTimeout(resolve, 500));

      const output = transport.capturePane(name);
      expect(output).toContain('hello-tmux-test');
    });

    it('should send special keys', async () => {
      const name = createTestSession('keys');
      transport.spawn(name, {
        command: '/bin/bash',
        args: [],
        cwd: '/tmp',
        env: { PS1: 'test> ' },
        cols: 80,
        rows: 24,
        historyLimit: 1000,
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      // Type something then Ctrl+C
      transport.sendText(name, 'sleep 100');
      transport.sendKey(name, 'enter');
      await new Promise(resolve => setTimeout(resolve, 200));
      transport.sendKey(name, 'ctrl+c');
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should still be alive (shell didn't exit)
      expect(transport.isAlive(name)).toBe(true);
    });
  });

  describe('introspection', () => {
    it('should get pane PID', () => {
      const name = createTestSession('pid');
      transport.spawn(name, {
        command: '/bin/bash',
        args: [],
        cwd: '/tmp',
        env: {},
        cols: 80,
        rows: 24,
        historyLimit: 1000,
      });

      const pid = transport.getPanePid(name);
      expect(pid).toBeDefined();
      expect(typeof pid).toBe('number');
      expect(pid).toBeGreaterThan(0);
    });

    it('should get pane dimensions', () => {
      const name = createTestSession('dims');
      transport.spawn(name, {
        command: '/bin/bash',
        args: [],
        cwd: '/tmp',
        env: {},
        cols: 100,
        rows: 30,
        historyLimit: 1000,
      });

      const dims = transport.getPaneDimensions(name);
      expect(dims.cols).toBe(100);
      expect(dims.rows).toBe(30);
    });

    it('should resize', () => {
      const name = createTestSession('resize');
      transport.spawn(name, {
        command: '/bin/bash',
        args: [],
        cwd: '/tmp',
        env: {},
        cols: 80,
        rows: 24,
        historyLimit: 1000,
      });

      transport.resize(name, 120, 40);
      const dims = transport.getPaneDimensions(name);
      expect(dims.cols).toBe(120);
      expect(dims.rows).toBe(40);
    });
  });

  describe('listSessions', () => {
    it('should list sessions with prefix filter', () => {
      const name = createTestSession('list');
      transport.spawn(name, {
        command: '/bin/bash',
        args: [],
        cwd: '/tmp',
        env: {},
        cols: 80,
        rows: 24,
        historyLimit: 1000,
      });

      const sessions = TmuxTransport.listSessions('test-tmux-');
      expect(sessions.length).toBeGreaterThanOrEqual(1);
      expect(sessions.some(s => s.name === name)).toBe(true);
    });
  });

  describe('TMUX_KEY_MAP', () => {
    it('should map common keys', () => {
      expect(TMUX_KEY_MAP['enter']).toBe('Enter');
      expect(TMUX_KEY_MAP['ctrl+c']).toBe('C-c');
      expect(TMUX_KEY_MAP['up']).toBe('Up');
      expect(TMUX_KEY_MAP['tab']).toBe('Tab');
      expect(TMUX_KEY_MAP['escape']).toBe('Escape');
      expect(TMUX_KEY_MAP['backspace']).toBe('BSpace');
    });
  });
});
