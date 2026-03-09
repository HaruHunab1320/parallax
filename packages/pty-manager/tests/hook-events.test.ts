/**
 * Hook Event Notification Tests
 *
 * Tests for notifyHookEvent() on PTYSession — the bridge between external
 * hook events (Claude Code HTTP hooks, Gemini CLI curl hooks) and the
 * internal session state machine.
 *
 * Uses fake timers to verify stall timer resets.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PTYSession } from '../src/pty-session';
import type { CLIAdapter } from '../src/adapters/adapter-interface';

function createMockAdapter(): CLIAdapter {
  return {
    adapterType: 'test',
    displayName: 'Test CLI',
    autoResponseRules: [],
    getCommand: () => 'echo',
    getArgs: () => [],
    getEnv: () => ({}),
    detectLogin: () => ({ required: false }),
    detectReady: () => false,
    detectExit: () => ({ exited: false }),
    detectBlockingPrompt: () => ({ detected: false }),
    parseOutput: () => null,
    getPromptPattern: () => /\$\s*$/,
    formatInput: (msg: string) => msg,
    validateInstallation: async () => ({ installed: true }),
  };
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

type SessionInternals = {
  _status: string;
  _stallDetectionEnabled: boolean;
  _stallTimeoutMs: number;
  _stallTimer: ReturnType<typeof setTimeout> | null;
  _lastActivityAt: Date;
  _lastBlockingPromptHash: string | null;
  outputBuffer: string;
  ptyProcess: {
    write: (data: string) => void;
    kill: (signal?: string) => void;
    pid: number;
    resize: (cols: number, rows: number) => void;
  } | null;
};

function getInternals(session: PTYSession): SessionInternals {
  return session as unknown as SessionInternals;
}

function createSessionWithStatus(status: string): PTYSession {
  const session = new PTYSession(
    createMockAdapter(),
    { name: 'test', type: 'test' },
    silentLogger as never,
    true,   // stall detection enabled
    5000,   // stall timeout
  );

  const internals = getInternals(session);
  internals._status = status;
  internals.ptyProcess = {
    write: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
    resize: vi.fn(),
  };

  return session;
}

// ---------------------------------------------------------------------------
// notifyHookEvent — tool_running
// ---------------------------------------------------------------------------
describe('notifyHookEvent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('tool_running', () => {
    it('resets lastActivityAt timestamp', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);

      // Set activity to the past
      const past = new Date(Date.now() - 60_000);
      internals._lastActivityAt = past;

      session.notifyHookEvent('tool_running');

      expect(internals._lastActivityAt.getTime()).toBeGreaterThan(past.getTime());
    });

    it('resets stall timer when content has changed', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);

      internals._stallDetectionEnabled = true;
      internals._stallTimeoutMs = 1000;

      const stallHandler = vi.fn();
      session.on('stall_detected', stallHandler);

      // Simulate output arriving — starts the stall timer
      internals.outputBuffer = 'Working on it...';
      session.resetStallTimer();

      // At 800ms, new output arrives and hook fires
      vi.advanceTimersByTime(800);
      internals.outputBuffer = 'Working on it... tool running';
      session.notifyHookEvent('tool_running');

      // The old timer was cleared and a new 1000ms timer started.
      // At 999ms from hook, stall should NOT have fired.
      vi.advanceTimersByTime(999);
      expect(stallHandler).not.toHaveBeenCalled();

      // At 1001ms from hook (total 1801ms), stall fires
      vi.advanceTimersByTime(2);
      expect(stallHandler).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------------
  // notifyHookEvent — task_complete
  // ---------------------------------------------------------------------------
  describe('task_complete', () => {
    it('transitions status to ready', () => {
      const session = createSessionWithStatus('busy');

      session.notifyHookEvent('task_complete');

      expect(session.status).toBe('ready');
    });

    it('clears blocking prompt hash', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);
      internals._lastBlockingPromptHash = 'permission:Allow write?';

      session.notifyHookEvent('task_complete');

      expect(internals._lastBlockingPromptHash).toBeNull();
    });

    it('clears output buffer', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);
      internals.outputBuffer = 'some previous output';

      session.notifyHookEvent('task_complete');

      expect(internals.outputBuffer).toBe('');
    });

    it('emits status_changed and task_complete events', () => {
      const session = createSessionWithStatus('busy');

      const statusHandler = vi.fn();
      const completeHandler = vi.fn();
      session.on('status_changed', statusHandler);
      session.on('task_complete', completeHandler);

      session.notifyHookEvent('task_complete');

      expect(statusHandler).toHaveBeenCalledWith('ready');
      expect(completeHandler).toHaveBeenCalledOnce();
    });

    it('clears stall timer', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);
      internals._stallDetectionEnabled = true;
      internals._stallTimeoutMs = 1000;

      const stallHandler = vi.fn();
      session.on('stall_detected', stallHandler);

      session.resetStallTimer();
      session.notifyHookEvent('task_complete');

      // Stall timer was cleared — should not fire even after timeout
      vi.advanceTimersByTime(5000);
      expect(stallHandler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // notifyHookEvent — permission_approved
  // ---------------------------------------------------------------------------
  describe('permission_approved', () => {
    it('preserves blocking prompt hash for TUI re-render dedup', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);
      internals._lastBlockingPromptHash = 'permission:Allow?';

      session.notifyHookEvent('permission_approved');

      // Hash is preserved so TUI re-renders of the same prompt are deduped
      // instead of emitting a flood of duplicate blocking_prompt events.
      expect(internals._lastBlockingPromptHash).toBe('permission:Allow?');
    });

    it('clears output buffer to prevent stale re-detection', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);
      internals.outputBuffer = 'Allow tool access? (y/n)';

      session.notifyHookEvent('permission_approved');

      expect(internals.outputBuffer).toBe('');
    });

    it('resets lastActivityAt', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);
      const past = new Date(Date.now() - 60_000);
      internals._lastActivityAt = past;

      session.notifyHookEvent('permission_approved');

      expect(internals._lastActivityAt.getTime()).toBeGreaterThan(past.getTime());
    });

    it('resets stall timer when content has changed', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);
      internals._stallDetectionEnabled = true;
      internals._stallTimeoutMs = 1000;

      const stallHandler = vi.fn();
      session.on('stall_detected', stallHandler);

      internals.outputBuffer = 'Allow write to file?';
      session.resetStallTimer();

      vi.advanceTimersByTime(800);
      internals.outputBuffer = 'Allow write to file? (approved)';
      session.notifyHookEvent('permission_approved');

      // 999ms from hook — should NOT have fired
      vi.advanceTimersByTime(999);
      expect(stallHandler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // notifyHookEvent — unknown event (default case)
  // ---------------------------------------------------------------------------
  describe('unknown event', () => {
    it('resets lastActivityAt for unrecognized events', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);
      const past = new Date(Date.now() - 60_000);
      internals._lastActivityAt = past;

      session.notifyHookEvent('some_unknown_event');

      expect(internals._lastActivityAt.getTime()).toBeGreaterThan(past.getTime());
    });

    it('resets stall timer when content has changed', () => {
      const session = createSessionWithStatus('busy');
      const internals = getInternals(session);
      internals._stallDetectionEnabled = true;
      internals._stallTimeoutMs = 1000;

      const stallHandler = vi.fn();
      session.on('stall_detected', stallHandler);

      internals.outputBuffer = 'Processing step 1';
      session.resetStallTimer();

      vi.advanceTimersByTime(800);
      internals.outputBuffer = 'Processing step 2';
      session.notifyHookEvent('some_unknown_event');

      // 999ms from hook — should NOT have fired
      vi.advanceTimersByTime(999);
      expect(stallHandler).not.toHaveBeenCalled();
    });
  });
});
