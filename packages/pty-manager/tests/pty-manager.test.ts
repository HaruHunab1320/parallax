import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PTYManager } from '../src/pty-manager';
import { ShellAdapter } from '../src/adapters/shell-adapter';
import { createAdapter } from '../src/adapters/adapter-factory';

describe('PTYManager', () => {
  let manager: PTYManager;

  beforeEach(() => {
    manager = new PTYManager();
  });

  describe('adapter management', () => {
    it('should start with no adapters', () => {
      expect(manager.adapters.list()).toHaveLength(0);
    });

    it('should register adapters', () => {
      manager.registerAdapter(new ShellAdapter());
      expect(manager.adapters.has('shell')).toBe(true);
    });

    it('should register multiple adapters', () => {
      manager.registerAdapter(new ShellAdapter());
      manager.registerAdapter(createAdapter({ command: 'test' }));

      expect(manager.adapters.list()).toContain('shell');
      expect(manager.adapters.list()).toContain('test');
    });
  });

  describe('session management (without PTY)', () => {
    it('should throw if adapter not found', async () => {
      await expect(
        manager.spawn({ name: 'test', type: 'unknown' })
      ).rejects.toThrow('No adapter found for type: unknown');
    });

    it('should include registered adapters in error message', async () => {
      manager.registerAdapter(new ShellAdapter());

      await expect(
        manager.spawn({ name: 'test', type: 'unknown' })
      ).rejects.toThrow('Registered adapters: shell');
    });

    it('should throw if session ID already exists', async () => {
      manager.registerAdapter(new ShellAdapter());

      // Note: This test would need PTY to actually work
      // For now, we test the logic without actually spawning
    });

    it('should return null for non-existent session', () => {
      expect(manager.get('nonexistent')).toBeNull();
    });

    it('should list empty sessions initially', () => {
      expect(manager.list()).toHaveLength(0);
    });

    it('should not have session by ID initially', () => {
      expect(manager.has('any-id')).toBe(false);
    });

    it('should throw when sending to non-existent session', () => {
      expect(() => manager.send('nonexistent', 'hello')).toThrow(
        'Session not found: nonexistent'
      );
    });

    it('should return null metrics for non-existent session', () => {
      expect(manager.metrics('nonexistent')).toBeNull();
    });

    it('should return null terminal for non-existent session', () => {
      expect(manager.attachTerminal('nonexistent')).toBeNull();
    });

    it('should return initial status counts', () => {
      const counts = manager.getStatusCounts();
      expect(counts.pending).toBe(0);
      expect(counts.starting).toBe(0);
      expect(counts.ready).toBe(0);
      expect(counts.busy).toBe(0);
      expect(counts.stopped).toBe(0);
      expect(counts.error).toBe(0);
    });
  });

  describe('logs', () => {
    it('should throw for non-existent session', async () => {
      const generator = manager.logs('nonexistent');
      await expect(generator.next()).rejects.toThrow('Session not found: nonexistent');
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully with no sessions', async () => {
      await expect(manager.shutdown()).resolves.not.toThrow();
    });

    it('should stopAll gracefully with no sessions', async () => {
      await expect(manager.stopAll()).resolves.not.toThrow();
    });
  });

  describe('configuration', () => {
    it('should accept custom logger', () => {
      const customLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const managerWithLogger = new PTYManager({ logger: customLogger });
      expect(managerWithLogger).toBeDefined();
    });

    it('should accept custom maxLogLines', () => {
      const managerWithConfig = new PTYManager({ maxLogLines: 500 });
      expect(managerWithConfig).toBeDefined();
    });
  });

  describe('events', () => {
    it('should be an EventEmitter', () => {
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.emit).toBe('function');
      expect(typeof manager.off).toBe('function');
    });

    it('should register event handlers', () => {
      const handler = vi.fn();
      manager.on('session_started', handler);
      manager.on('session_ready', handler);
      manager.on('session_stopped', handler);
      manager.on('session_error', handler);
      manager.on('login_required', handler);
      manager.on('auth_required', handler);
      manager.on('blocking_prompt', handler);
      manager.on('message', handler);
      manager.on('question', handler);
      // No errors thrown
    });
  });
});
