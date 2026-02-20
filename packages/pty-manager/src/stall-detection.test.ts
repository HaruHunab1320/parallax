/**
 * Stall Detection Tests
 *
 * Tests for the stall detection timer and external classification hook.
 * Uses fake timers to control timeout behavior.
 *
 * Since PTYSession requires node-pty (native addon), we test stall detection
 * by creating sessions and manipulating internal state directly, bypassing
 * the actual PTY process spawn.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PTYSession } from './pty-session';
import type { CLIAdapter } from './adapters/adapter-interface';
import type { StallClassification } from './types';

/**
 * Create a minimal mock adapter for testing
 */
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

/**
 * Access private fields of PTYSession for testing.
 * We bypass start() (which needs node-pty) and manually set up the session.
 */
type SessionInternals = {
  _status: string;
  _stallDetectionEnabled: boolean;
  _stallTimeoutMs: number;
  _stallTimer: ReturnType<typeof setTimeout> | null;
  _stallStartedAt: number | null;
  _lastStallHash: string | null;
  _lastContentHash: string | null;
  _lastBlockingPromptHash: string | null;
  _stallBackoffMs: number;
  _stallEmissionCount: number;
  _firedOnceRules: Set<string>;
  _taskCompletePending: boolean;
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

/**
 * Create a session that's ready for stall testing.
 * Sets up a fake ptyProcess and status='busy'.
 */
function createBusySession(opts: {
  enabled?: boolean;
  timeoutMs?: number;
  sessionTimeoutMs?: number;
} = {}): { session: PTYSession; writeFn: ReturnType<typeof vi.fn> } {
  const writeFn = vi.fn();

  const session = new PTYSession(
    createMockAdapter(),
    {
      name: 'test',
      type: 'test',
      stallTimeoutMs: opts.sessionTimeoutMs,
    },
    silentLogger as never,
    opts.enabled ?? true,
    opts.timeoutMs ?? 5000,
  );

  // Set up fake ptyProcess and status
  const internals = getInternals(session);
  internals.ptyProcess = {
    write: writeFn,
    kill: vi.fn(),
    pid: 12345,
    resize: vi.fn(),
  };
  internals._status = 'busy';

  return { session, writeFn };
}

/**
 * Simulate output arriving in the session's buffer and trigger stall timer reset.
 * In real usage this happens in onData handler — here we simulate it directly.
 */
function simulateOutput(session: PTYSession, data: string): void {
  const internals = getInternals(session);
  internals.outputBuffer += data;

  // In real PTYSession, onData calls resetStallTimer when busy or authenticating
  // We call send() to trigger it, but since we're testing the timer directly,
  // we need to invoke the private resetStallTimer. We do this by calling
  // the method via bracket notation.
  if ((internals._status === 'busy' || internals._status === 'authenticating') && internals._stallDetectionEnabled) {
    (session as unknown as { resetStallTimer: () => void }).resetStallTimer();
  }
}

describe('PTYSession Stall Detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not emit stall_detected when disabled', () => {
    const { session } = createBusySession({ enabled: false });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'some output');
    vi.advanceTimersByTime(10000);

    expect(stallHandler).not.toHaveBeenCalled();
  });

  it('should not emit stall_detected when status is not busy', () => {
    const { session } = createBusySession({ enabled: true });
    const internals = getInternals(session);
    internals._status = 'starting'; // not busy

    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'some output');
    vi.advanceTimersByTime(10000);

    expect(stallHandler).not.toHaveBeenCalled();
  });

  it('should emit stall_detected after timeout when busy and silent', () => {
    const { session } = createBusySession({ timeoutMs: 5000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Working on it...');

    // Silence for the timeout period
    vi.advanceTimersByTime(5000);

    expect(stallHandler).toHaveBeenCalledTimes(1);
    expect(stallHandler).toHaveBeenCalledWith(
      expect.stringContaining('Working on it'),
      expect.any(Number),
    );
  });

  it('should reset timer when new output arrives before timeout', () => {
    const { session } = createBusySession({ timeoutMs: 5000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Starting...');

    // Advance 4s (not enough for 5s timeout)
    vi.advanceTimersByTime(4000);
    expect(stallHandler).not.toHaveBeenCalled();

    // More output at 4s — resets timer
    simulateOutput(session, 'Still going...');

    // Advance another 4s (total 8s from start, but only 4s from last output)
    vi.advanceTimersByTime(4000);
    expect(stallHandler).not.toHaveBeenCalled();

    // Advance 1 more second (5s from last output)
    vi.advanceTimersByTime(1000);
    expect(stallHandler).toHaveBeenCalledTimes(1);
  });

  it('should clear timer when status transitions away from busy', () => {
    const { session } = createBusySession({ timeoutMs: 5000 });
    const internals = getInternals(session);
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Some output...');

    // Advance partway
    vi.advanceTimersByTime(3000);

    // Transition away from busy
    internals._status = 'ready';
    // In real code, clearStallTimer is called. Simulate it:
    (session as unknown as { clearStallTimer: () => void }).clearStallTimer();

    // Advance past timeout
    vi.advanceTimersByTime(10000);

    expect(stallHandler).not.toHaveBeenCalled();
  });

  it('should deduplicate emissions for unchanged buffer', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Some output that stays the same');

    // First stall fires at 3s
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Second check at 6s — buffer unchanged, should NOT re-emit
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Third check at 9s — still unchanged
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);
  });

  it('should emit again after new output arrives post-dedup', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'First output');

    // First stall at 3s
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // New output arrives (resets dedup hash via resetStallTimer)
    simulateOutput(session, ' more output');

    // Stall fires again 3s later with new content
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(2);
  });

  it('should strip ANSI codes from recentOutput', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    // Output with ANSI codes and cursor-forward sequences
    simulateOutput(session, '\x1b[32mGreen text\x1b[0m\x1b[10Cspaced out');

    vi.advanceTimersByTime(3000);

    expect(stallHandler).toHaveBeenCalledTimes(1);
    const recentOutput = stallHandler.mock.calls[0][0];
    // Should not contain ANSI escape codes
    expect(recentOutput).not.toMatch(/\x1b/);
    // Content should be preserved
    expect(recentOutput).toContain('Green text');
    expect(recentOutput).toContain('spaced out');
  });

  it('should NOT reset timer when only ANSI spinner data arrives (content unchanged)', () => {
    const { session } = createBusySession({ timeoutMs: 5000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    // Real content output
    simulateOutput(session, 'Processing your request...');

    // Advance 3s — no stall yet
    vi.advanceTimersByTime(3000);
    expect(stallHandler).not.toHaveBeenCalled();

    // Spinner-only data: ANSI cursor movement and color changes that
    // produce NO new visible characters after stripping.
    // This simulates TUI spinners that redraw the same line.
    const internals = getInternals(session);
    internals.outputBuffer += '\x1b[1G\x1b[2K\x1b[33m\x1b[0m';
    // Call resetStallTimer — content hash hasn't changed (stripped text is the same)
    (session as unknown as { resetStallTimer: () => void }).resetStallTimer();

    // More spinner frames (still just ANSI, no new visible text)
    internals.outputBuffer += '\x1b[1G\x1b[K\x1b[36m\x1b[0m';
    (session as unknown as { resetStallTimer: () => void }).resetStallTimer();

    // Timer should still fire at 5s from original content, not reset by spinners
    vi.advanceTimersByTime(2000); // 5s total from "Processing..." output
    expect(stallHandler).toHaveBeenCalledTimes(1);
  });

  it('should respect per-session stallTimeoutMs override', () => {
    const { session } = createBusySession({
      timeoutMs: 8000, // manager default
      sessionTimeoutMs: 2000, // session override
    });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Some output');

    // Should fire at 2s (session override), not 8s (manager default)
    vi.advanceTimersByTime(2000);
    expect(stallHandler).toHaveBeenCalledTimes(1);
  });
});

describe('handleStallClassification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should reset timer on null classification (with backoff)', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'output');

    // Wait for stall
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Classify as null — timer resets with doubled backoff (3s → 6s)
    session.handleStallClassification(null);

    // Should NOT fire at 3s (old interval)
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Should fire at 6s (backed-off interval)
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(2);
  });

  it('should reset timer on still_working classification (with backoff)', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'output');

    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Classify as still_working — backoff doubles (3s → 6s)
    session.handleStallClassification({ state: 'still_working' });

    // Should NOT fire at 3s
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Should fire at 6s
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(2);
  });

  it('should emit blocking_prompt and auto-send on waiting_for_input with suggestedResponse', () => {
    const { session, writeFn } = createBusySession({ timeoutMs: 3000 });
    const blockingHandler = vi.fn();
    session.on('blocking_prompt', blockingHandler);

    simulateOutput(session, 'Do you want to continue?');
    vi.advanceTimersByTime(3000);

    const classification: StallClassification = {
      state: 'waiting_for_input',
      prompt: 'Asking for confirmation',
      suggestedResponse: 'y',
    };

    session.handleStallClassification(classification);

    expect(blockingHandler).toHaveBeenCalledTimes(1);
    const [promptInfo, autoResponded] = blockingHandler.mock.calls[0];
    expect(promptInfo.type).toBe('stall_classified');
    expect(promptInfo.canAutoRespond).toBe(true);
    expect(autoResponded).toBe(true);

    // Verify it wrote the response
    expect(writeFn).toHaveBeenCalledWith('y\r');
  });

  it('should emit blocking_prompt without auto-send when no suggestedResponse', () => {
    const { session, writeFn } = createBusySession({ timeoutMs: 3000 });
    const blockingHandler = vi.fn();
    session.on('blocking_prompt', blockingHandler);

    simulateOutput(session, 'Choose an option:');
    vi.advanceTimersByTime(3000);

    const classification: StallClassification = {
      state: 'waiting_for_input',
      prompt: 'Menu selection needed',
    };

    session.handleStallClassification(classification);

    expect(blockingHandler).toHaveBeenCalledTimes(1);
    const [promptInfo, autoResponded] = blockingHandler.mock.calls[0];
    expect(promptInfo.type).toBe('stall_classified');
    expect(promptInfo.canAutoRespond).toBe(false);
    expect(autoResponded).toBe(false);

    // Should NOT have written anything
    expect(writeFn).not.toHaveBeenCalled();
  });

  it('should transition to ready on task_complete', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const readyHandler = vi.fn();
    session.on('ready', readyHandler);

    simulateOutput(session, 'Done.');
    vi.advanceTimersByTime(3000);

    session.handleStallClassification({ state: 'task_complete' });

    expect(session.status).toBe('ready');
    expect(readyHandler).toHaveBeenCalledTimes(1);
    expect(session.getOutputBuffer()).toBe('');
  });

  it('should emit error on error classification', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const errorHandler = vi.fn();
    session.on('error', errorHandler);

    simulateOutput(session, 'Something went wrong');
    vi.advanceTimersByTime(3000);

    session.handleStallClassification({
      state: 'error',
      prompt: 'Session appears stuck',
    });

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler.mock.calls[0][0].message).toBe('Session appears stuck');
  });

  it('should ignore classification if session is no longer busy', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const internals = getInternals(session);
    const readyHandler = vi.fn();
    session.on('ready', readyHandler);

    simulateOutput(session, 'output');
    vi.advanceTimersByTime(3000);

    // Session transitions away from busy
    internals._status = 'stopped';

    // Classification arrives after status change — should be ignored
    session.handleStallClassification({ state: 'task_complete' });

    // ready should NOT have been emitted
    expect(readyHandler).not.toHaveBeenCalled();
    expect(internals._status).toBe('stopped');
  });
});

describe('tryAutoResponse ANSI stripping', () => {
  it('should match auto-response rules against ANSI-stripped output', () => {
    const adapter = createMockAdapter();
    adapter.autoResponseRules = [
      {
        pattern: /update available.*\[y\/n\]/i,
        type: 'update',
        response: 'n',
        description: 'Decline update',
        safe: true,
      },
    ];

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';

    // Buffer contains ANSI codes that would prevent regex match on raw text
    internals.outputBuffer = '\x1b[33mUpdate available\x1b[0m \x1b[10C[y/n]';

    const blockingHandler = vi.fn();
    session.on('blocking_prompt', blockingHandler);

    // Trigger detection by calling the private method via bracket notation
    const handled = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();

    expect(handled).toBe(true);
    expect(blockingHandler).toHaveBeenCalledTimes(1);
    expect(blockingHandler.mock.calls[0][1]).toBe(true); // autoResponded
    expect(writeFn).toHaveBeenCalledWith('n\r');
  });

  it('should match auto-response rules against TUI box-drawing stripped output', () => {
    const adapter = createMockAdapter();
    adapter.autoResponseRules = [
      {
        pattern: /trust the contents/i,
        type: 'permission',
        response: 'y',
        description: 'Trust directory',
        safe: true,
      },
    ];

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';

    // Buffer with TUI box-drawing characters mixed into the text
    internals.outputBuffer = '│ Do you trust the contents │';

    const blockingHandler = vi.fn();
    session.on('blocking_prompt', blockingHandler);

    const handled = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();

    expect(handled).toBe(true);
    expect(writeFn).toHaveBeenCalledWith('y\r');
  });

  it('should not match when stripped output does not contain pattern', () => {
    const adapter = createMockAdapter();
    adapter.autoResponseRules = [
      {
        pattern: /update available/i,
        type: 'update',
        response: 'n',
        description: 'Decline update',
        safe: true,
      },
    ];

    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';

    // Buffer has ANSI codes but no matching text
    internals.outputBuffer = '\x1b[32mProcessing...\x1b[0m';

    const handled = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();

    expect(handled).toBe(false);
  });
});

describe('TUI key-sequence auto-response', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should send Enter via sendKeys for rule with keys: ["enter"]', () => {
    const adapter = createMockAdapter();
    adapter.autoResponseRules = [
      {
        pattern: /trust the contents/i,
        type: 'permission',
        response: '',
        responseType: 'keys',
        keys: ['enter'],
        description: 'Trust directory',
        safe: true,
      },
    ];

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';
    internals.outputBuffer = 'Do you trust the contents of this directory?';

    const handled = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();

    expect(handled).toBe(true);
    // Key sent immediately (0ms delay for first key)
    vi.advanceTimersByTime(0);
    expect(writeFn).toHaveBeenCalledWith('\r'); // Enter key escape sequence
  });

  it('should send Down then Enter for rule with keys: ["down", "enter"]', () => {
    const adapter = createMockAdapter();
    adapter.autoResponseRules = [
      {
        pattern: /Update available/i,
        type: 'config',
        response: '',
        responseType: 'keys',
        keys: ['down', 'enter'],
        description: 'Skip update',
        safe: true,
      },
    ];

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';
    internals.outputBuffer = 'Update available. 1. Update now 2. Skip';

    const handled = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();

    expect(handled).toBe(true);
    // First key (down) at 0ms
    vi.advanceTimersByTime(0);
    expect(writeFn).toHaveBeenCalledWith('\x1b[B'); // Down arrow

    // Second key (enter) at 50ms
    vi.advanceTimersByTime(50);
    expect(writeFn).toHaveBeenCalledWith('\r'); // Enter
  });

  it('should send text via writeRaw for rule with responseType: "text"', () => {
    const adapter = createMockAdapter();
    adapter.autoResponseRules = [
      {
        pattern: /continue\? \[y\/n\]/i,
        type: 'config',
        response: 'y',
        responseType: 'text',
        description: 'Continue',
        safe: true,
      },
    ];

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';
    internals.outputBuffer = 'Do you want to continue? [y/n]';

    const handled = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();

    expect(handled).toBe(true);
    expect(writeFn).toHaveBeenCalledWith('y\r');
  });

  it('should default to sendKeys Enter for TUI adapter with no explicit responseType', () => {
    const adapter = createMockAdapter();
    (adapter as unknown as { usesTuiMenus: boolean }).usesTuiMenus = true;
    adapter.autoResponseRules = [
      {
        pattern: /confirm action/i,
        type: 'permission',
        response: 'y',
        description: 'Confirm action',
        safe: true,
      },
    ];

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';
    internals.outputBuffer = 'Please confirm action';

    const handled = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();

    expect(handled).toBe(true);
    // Should use sendKeys('enter') → writes '\r' via ptyProcess.write
    expect(writeFn).toHaveBeenCalledWith('\r');
    // Should NOT have written 'y\r' (text response)
    expect(writeFn).not.toHaveBeenCalledWith('y\r');
  });

  it('selectMenuOption(0) should send Enter only', async () => {
    const writeFn = vi.fn();
    const session = new PTYSession(
      createMockAdapter(),
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };

    await session.selectMenuOption(0);

    // Should only send Enter (no Down presses for index 0)
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn).toHaveBeenCalledWith('\r');
  });

  it('selectMenuOption(2) should send Down, Down, Enter with delays', async () => {
    const writeFn = vi.fn();
    const session = new PTYSession(
      createMockAdapter(),
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };

    const promise = session.selectMenuOption(2);

    // First Down at 0ms
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn).toHaveBeenNthCalledWith(1, '\x1b[B');

    // After 50ms delay, second Down
    vi.advanceTimersByTime(50);
    await Promise.resolve(); // Flush microtasks
    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(writeFn).toHaveBeenNthCalledWith(2, '\x1b[B');

    // After another 50ms delay, Enter
    vi.advanceTimersByTime(50);
    await Promise.resolve();
    await promise;
    expect(writeFn).toHaveBeenCalledTimes(3);
    expect(writeFn).toHaveBeenNthCalledWith(3, '\r');
  });

  it('stall classification with "keys:down,enter" should parse and send key sequence', () => {
    const { session, writeFn } = createBusySession({ timeoutMs: 3000 });
    const blockingHandler = vi.fn();
    session.on('blocking_prompt', blockingHandler);

    simulateOutput(session, 'Select an option:');
    vi.advanceTimersByTime(3000);

    const classification: StallClassification = {
      state: 'waiting_for_input',
      prompt: 'Menu selection',
      suggestedResponse: 'keys:down,enter',
    };

    session.handleStallClassification(classification);

    expect(blockingHandler).toHaveBeenCalledTimes(1);
    const [promptInfo, autoResponded] = blockingHandler.mock.calls[0];
    expect(promptInfo.canAutoRespond).toBe(true);
    expect(autoResponded).toBe(true);

    // First key (down) at 0ms
    vi.advanceTimersByTime(0);
    expect(writeFn).toHaveBeenCalledWith('\x1b[B');

    // Second key (enter) at 50ms
    vi.advanceTimersByTime(50);
    expect(writeFn).toHaveBeenCalledWith('\r');
  });

  it('detectBlockingPrompt suggestedResponse "keys:enter" should parse and send correctly', () => {
    const adapter = createMockAdapter();
    adapter.detectBlockingPrompt = () => ({
      detected: true,
      type: 'permission',
      prompt: 'Apply changes?',
      suggestedResponse: 'keys:enter',
      canAutoRespond: true,
    });

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';
    internals.outputBuffer = 'Apply changes?';

    const blockingHandler = vi.fn();
    session.on('blocking_prompt', blockingHandler);

    const handled = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();

    expect(handled).toBe(true);
    expect(blockingHandler).toHaveBeenCalledTimes(1);
    expect(blockingHandler.mock.calls[0][1]).toBe(true); // autoResponded

    // Should have sent Enter via sendKeys (setTimeout scheduling)
    vi.advanceTimersByTime(0);
    expect(writeFn).toHaveBeenCalledWith('\r');
    // Should NOT have sent 'keys:enter\r' as raw text
    expect(writeFn).not.toHaveBeenCalledWith('keys:enter\r');
  });
});

describe('once-rule auto-response thrashing prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should fire a once-rule only once, even if buffer re-matches', () => {
    const adapter = createMockAdapter();
    adapter.autoResponseRules = [
      {
        pattern: /trust.*folder/i,
        type: 'permission',
        response: '',
        responseType: 'keys',
        keys: ['enter'],
        description: 'Trust directory',
        safe: true,
        once: true,
      },
    ];

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';

    // First trigger
    internals.outputBuffer = 'Do you trust this folder?';
    const handled1 = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();
    expect(handled1).toBe(true);
    vi.advanceTimersByTime(0); // Flush sendKeySequence setTimeout(fn, 0)
    expect(writeFn).toHaveBeenCalledTimes(1); // Enter sent

    // TUI re-renders the same prompt text
    internals.outputBuffer = 'Do you trust this folder?';
    const handled2 = (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();
    expect(handled2).toBe(false); // Should NOT fire again
    expect(writeFn).toHaveBeenCalledTimes(1); // No additional write
  });

  it('should still fire non-once rules multiple times', () => {
    const adapter = createMockAdapter();
    adapter.autoResponseRules = [
      {
        pattern: /permission/i,
        type: 'permission',
        response: 'y',
        responseType: 'text',
        description: 'Grant permission',
        safe: true,
        // once is NOT set
      },
    ];

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'ready';

    // First trigger
    internals.outputBuffer = 'Grant permission?';
    (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();
    expect(writeFn).toHaveBeenCalledTimes(1);

    // Second trigger — should still fire
    internals.outputBuffer = 'Grant permission again?';
    (session as unknown as { detectAndHandleBlockingPrompt: () => boolean }).detectAndHandleBlockingPrompt();
    expect(writeFn).toHaveBeenCalledTimes(2);
  });
});

describe('stripAnsiForStall cursor movement handling', () => {
  it('should replace \\x1b[n;mH (absolute position) with spaces', () => {
    const session = new PTYSession(
      createMockAdapter(),
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const strip = (session as unknown as { stripAnsiForStall: (s: string) => string }).stripAnsiForStall;
    const result = strip.call(session, 'Do\x1b[5;10Hyou\x1b[6;1Htrust');
    expect(result).toContain('Do');
    expect(result).toContain('you');
    expect(result).toContain('trust');
    // Should have spaces between words, not be concatenated
    expect(result).not.toBe('Doyoutrust');
  });

  it('should replace \\x1b[nG (column position) with spaces', () => {
    const session = new PTYSession(
      createMockAdapter(),
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const strip = (session as unknown as { stripAnsiForStall: (s: string) => string }).stripAnsiForStall;
    const result = strip.call(session, 'safety\x1b[20Gcheck');
    expect(result).toContain('safety');
    expect(result).toContain('check');
    expect(result).not.toBe('safetycheck');
  });

  it('should normalize countdown/duration text for consistent hashing', () => {
    const session = new PTYSession(
      createMockAdapter(),
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const strip = (session as unknown as { stripAnsiForStall: (s: string) => string }).stripAnsiForStall;

    // Two outputs differing only by countdown should hash the same
    const a = strip.call(session, 'Initiating PR Creation (esc to cancel, 8m 17s)');
    const b = strip.call(session, 'Initiating PR Creation (esc to cancel, 8m 16s)');
    expect(a).toBe(b);

    // Different countdown formats should also normalize
    const c = strip.call(session, 'Running shell command (esc to cancel, 1h 02m 30s)');
    const d = strip.call(session, 'Running shell command (esc to cancel, 1h 02m 29s)');
    expect(c).toBe(d);

    // Seconds-only should normalize
    const e = strip.call(session, 'Working (5s)');
    const f = strip.call(session, 'Working (12s)');
    expect(e).toBe(f);
  });

  it('should strip spinner characters', () => {
    const session = new PTYSession(
      createMockAdapter(),
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const strip = (session as unknown as { stripAnsiForStall: (s: string) => string }).stripAnsiForStall;
    const result = strip.call(session, '⠋ Loading ⠙ Loading ⠹ Loading');
    // Spinner chars stripped, text preserved
    expect(result).toContain('Loading');
    expect(result).not.toMatch(/[⠋⠙⠹]/);
  });
});

describe('PTYManager stall detection config', () => {
  it('should store stall config from constructor', async () => {
    // Use dynamic import to avoid module-level issues
    const { PTYManager } = await import('./pty-manager');

    const classifyFn = vi.fn().mockResolvedValue(null);

    const manager = new PTYManager({
      stallDetectionEnabled: true,
      stallTimeoutMs: 5000,
      onStallClassify: classifyFn,
    });

    // Verify config via configureStallDetection (which updates internal state)
    // We just verify it doesn't throw
    manager.configureStallDetection(false);
    manager.configureStallDetection(true, 3000, classifyFn);
  });

  it('should update config via configureStallDetection', async () => {
    const { PTYManager } = await import('./pty-manager');

    const manager = new PTYManager();

    // Should not throw
    manager.configureStallDetection(true, 10000);
    manager.configureStallDetection(false);
  });
});

describe('Loading pattern suppression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should suppress stall emission when adapter.detectLoading returns true', () => {
    const adapter = createMockAdapter();
    adapter.detectLoading = () => true;

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
      true,  // stall detection enabled
      5000,  // timeout
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'busy';

    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Working on it...');

    // Timer fires at 5s — but loading is detected, so no emission
    vi.advanceTimersByTime(5000);
    expect(stallHandler).not.toHaveBeenCalled();

    // Timer reschedules — still loading, still suppressed
    vi.advanceTimersByTime(5000);
    expect(stallHandler).not.toHaveBeenCalled();
  });

  it('should emit stall_detected once loading pattern disappears', () => {
    let isLoading = true;
    const adapter = createMockAdapter();
    adapter.detectLoading = () => isLoading;

    const writeFn = vi.fn();
    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
      true,
      5000,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: writeFn,
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'busy';

    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Processing...');

    // First check at 5s — loading detected, suppressed
    vi.advanceTimersByTime(5000);
    expect(stallHandler).not.toHaveBeenCalled();

    // Loading stops
    isLoading = false;

    // Next check fires — no longer loading, should emit
    vi.advanceTimersByTime(5000);
    expect(stallHandler).toHaveBeenCalledTimes(1);
  });

  it('should not call detectLoading when adapter does not implement it', () => {
    const adapter = createMockAdapter();
    // No detectLoading on adapter

    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
      true,
      3000,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'busy';

    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Some output');

    // Should fire normally without detectLoading
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);
  });
});

describe('Stall backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should double backoff interval on still_working classification', () => {
    const { session } = createBusySession({ timeoutMs: 4000 });
    const internals = getInternals(session);
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Working on task...');

    // Initial backoff should equal the base timeout
    expect(internals._stallBackoffMs).toBe(4000);

    // First stall at 4s
    vi.advanceTimersByTime(4000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Classify as still_working — backoff doubles to 8s
    session.handleStallClassification({ state: 'still_working' });
    expect(internals._stallBackoffMs).toBe(8000);

    // Next stall at 8s from classification
    vi.advanceTimersByTime(8000);
    expect(stallHandler).toHaveBeenCalledTimes(2);

    // Classify again — backoff doubles to 16s
    session.handleStallClassification({ state: 'still_working' });
    expect(internals._stallBackoffMs).toBe(16000);
  });

  it('should cap backoff at MAX_STALL_BACKOFF_MS (30s)', () => {
    const { session } = createBusySession({ timeoutMs: 4000 });
    const internals = getInternals(session);
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Working...');

    // First stall at 4s
    vi.advanceTimersByTime(4000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // 4s → 8s
    session.handleStallClassification({ state: 'still_working' });
    expect(internals._stallBackoffMs).toBe(8000);

    vi.advanceTimersByTime(8000);
    // 8s → 16s
    session.handleStallClassification({ state: 'still_working' });
    expect(internals._stallBackoffMs).toBe(16000);

    vi.advanceTimersByTime(16000);
    // 16s → 30s (capped, not 32s)
    session.handleStallClassification({ state: 'still_working' });
    expect(internals._stallBackoffMs).toBe(30000);

    vi.advanceTimersByTime(30000);
    // 30s → 30s (stays capped)
    session.handleStallClassification({ state: 'still_working' });
    expect(internals._stallBackoffMs).toBe(30000);
  });

  it('should reset backoff when new real content arrives', () => {
    const { session } = createBusySession({ timeoutMs: 4000 });
    const internals = getInternals(session);
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'First output');

    // Stall fires at 4s
    vi.advanceTimersByTime(4000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Back off to 8s
    session.handleStallClassification({ state: 'still_working' });
    expect(internals._stallBackoffMs).toBe(8000);

    // New real output arrives — backoff resets to base
    simulateOutput(session, ' new content');
    expect(internals._stallBackoffMs).toBe(4000);

    // Next stall fires at 4s (not 8s)
    vi.advanceTimersByTime(4000);
    expect(stallHandler).toHaveBeenCalledTimes(2);
  });

  it('should apply backoff to null classification (same as still_working)', () => {
    const { session } = createBusySession({ timeoutMs: 4000 });
    const internals = getInternals(session);
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Output');

    vi.advanceTimersByTime(4000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Null classification — should also double backoff
    session.handleStallClassification(null);
    expect(internals._stallBackoffMs).toBe(8000);

    vi.advanceTimersByTime(8000);
    expect(stallHandler).toHaveBeenCalledTimes(2);
  });

  it('should reset backoff when clearStallTimer is called', () => {
    const { session } = createBusySession({ timeoutMs: 4000 });
    const internals = getInternals(session);

    simulateOutput(session, 'Output');

    vi.advanceTimersByTime(4000);
    session.handleStallClassification({ state: 'still_working' });
    expect(internals._stallBackoffMs).toBe(8000);

    // Simulate task completing — clearStallTimer resets backoff
    (session as unknown as { clearStallTimer: () => void }).clearStallTimer();
    expect(internals._stallBackoffMs).toBe(4000);
  });
});

describe('Task complete settle pattern', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not cancel task_complete timer when detectReady fails on subsequent output', () => {
    const adapter = createMockAdapter();
    // detectReady checks for a prompt pattern in the buffer.
    // The prompt is always present, but in the old cancel-on-any-data code,
    // the else branch would cancel the timer on non-matching output.
    // With the settle pattern, _taskCompletePending short-circuits the
    // detectReady check, keeping the timer alive.
    adapter.detectReady = (buffer: string) => buffer.includes('$');

    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'busy';

    const statusHandler = vi.fn();
    const taskCompleteHandler = vi.fn();
    session.on('status_changed', statusHandler);
    session.on('task_complete', taskCompleteHandler);

    const processOutputBuffer = (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer;

    // First processOutputBuffer — buffer has prompt, detectReady returns true
    internals.outputBuffer = 'Done.\n$ ';
    processOutputBuffer.call(session);
    expect(internals._taskCompletePending).toBe(true);

    // Second processOutputBuffer — decorative TUI output appended.
    // With settle pattern, _taskCompletePending keeps the timer alive
    // (timer resets instead of being cancelled).
    internals.outputBuffer += '\x1b[40;1Hstatus bar content';
    processOutputBuffer.call(session);
    expect(internals._taskCompletePending).toBe(true);

    // Timer fires after debounce — re-verifies detectReady (buffer still has '$')
    vi.advanceTimersByTime(1500);
    expect(taskCompleteHandler).toHaveBeenCalledTimes(1);
    expect(statusHandler).toHaveBeenCalledWith('ready');
    expect(internals._status).toBe('ready');
  });

  it('should reset task_complete debounce timer on each new data chunk', () => {
    const adapter = createMockAdapter();
    adapter.detectReady = () => true;

    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'busy';

    const taskCompleteHandler = vi.fn();
    session.on('task_complete', taskCompleteHandler);

    const processOutputBuffer = (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer;

    // Initial trigger
    processOutputBuffer.call(session);
    expect(internals._taskCompletePending).toBe(true);

    // Advance 1000ms (less than 1500ms debounce)
    vi.advanceTimersByTime(1000);
    expect(taskCompleteHandler).not.toHaveBeenCalled();

    // New data arrives — resets debounce timer
    internals.outputBuffer += 'decorative TUI output';
    processOutputBuffer.call(session);

    // Advance another 1000ms (2000ms total, but only 1000ms since reset)
    vi.advanceTimersByTime(1000);
    expect(taskCompleteHandler).not.toHaveBeenCalled();

    // Advance remaining 500ms (1500ms since last reset)
    vi.advanceTimersByTime(500);
    expect(taskCompleteHandler).toHaveBeenCalledTimes(1);
    expect(internals._status).toBe('ready');
  });

  it('should prefer detectTaskComplete over detectReady while busy', () => {
    const adapter = createMockAdapter();
    adapter.detectReady = () => true;
    adapter.detectTaskComplete = () => false;

    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'busy';
    internals.outputBuffer = 'transient prompt-like output';

    const processOutputBuffer = (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer;
    processOutputBuffer.call(session);

    expect(internals._taskCompletePending).toBe(false);
    expect(internals._status).toBe('busy');
  });

  it('should strip OSC sequences from stall output', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    // Output with OSC window title sequence
    simulateOutput(session, 'Hello \x1b]0;Window Title\x07 World');

    vi.advanceTimersByTime(3000);

    expect(stallHandler).toHaveBeenCalledTimes(1);
    const recentOutput = stallHandler.mock.calls[0][0];
    expect(recentOutput).not.toContain('Window Title');
    expect(recentOutput).toContain('Hello');
    expect(recentOutput).toContain('World');
  });

  it('should preserve visible text when ANSI + cursor movement are present', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });

    const stripAnsiForStall = (session as unknown as {
      stripAnsiForStall: (s: string) => string;
    }).stripAnsiForStall;

    const raw =
      '\x1b[6A\x1b[38;2;215;119;87m✻\x1b[39m ' +
      "\x1b[38;2;255;255;255m⏺\x1b[1C\x1b[39mDone. Here's the summary:" +
      '\r\x1b[1B❯\x1b[2C';

    const stripped = stripAnsiForStall(raw);
    expect(stripped).toContain("Done. Here's the summary:");
    expect(stripped.trim().length).toBeGreaterThan(0);
  });

  it('should preserve visible symbols/text for classifier stripping', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });

    const stripAnsiForClassifier = (session as unknown as {
      stripAnsiForClassifier: (s: string) => string;
    }).stripAnsiForClassifier;

    const raw =
      '\x1b[6A\x1b[38;2;215;119;87m✻\x1b[39m ' +
      "\x1b[38;2;255;255;255m⏺\x1b[1C\x1b[39mDone. Here's the summary:" +
      '\r\x1b[1B❯\x1b[2C';

    const stripped = stripAnsiForClassifier(raw);
    expect(stripped).toContain("Done. Here's the summary:");
    expect(stripped).toContain('✻');
    expect(stripped).toContain('❯');
  });

  it('should not parse-and-clear output while busy', () => {
    const adapter = createMockAdapter();
    adapter.parseOutput = () => ({
      type: 'response',
      content: 'parsed',
      isComplete: true,
      isQuestion: false,
    });

    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'busy';
    internals.outputBuffer = 'Claude produced output\nDone.';

    const processOutputBuffer = (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer;
    processOutputBuffer.call(session);

    expect(internals.outputBuffer).toBe('Claude produced output\nDone.');
  });

  it('should transition via fast-path when TUI renders decorative content after prompt', () => {
    const adapter = createMockAdapter();
    adapter.detectReady = (buffer: string) => buffer.includes('$');

    const session = new PTYSession(
      adapter,
      { name: 'test', type: 'test' },
      silentLogger as never,
    );

    const internals = getInternals(session);
    internals.ptyProcess = {
      write: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
      resize: vi.fn(),
    };
    internals._status = 'busy';

    const taskCompleteHandler = vi.fn();
    const statusHandler = vi.fn();
    session.on('task_complete', taskCompleteHandler);
    session.on('status_changed', statusHandler);

    const processOutputBuffer = (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer;

    // Agent finishes task — output contains duration + prompt
    internals.outputBuffer = 'Task completed in 2.3s\n$ ';
    processOutputBuffer.call(session);
    expect(internals._taskCompletePending).toBe(true);

    // TUI renders status bar update (decorative content)
    internals.outputBuffer += '\x1b[40;1H\x1b[2K\x1b[36mStatus: idle\x1b[0m';
    processOutputBuffer.call(session);

    // TUI renders update notice
    internals.outputBuffer += '\x1b[1;1H\x1b[33mUpdate available v1.2.3\x1b[0m';
    processOutputBuffer.call(session);

    // Timer should still be pending
    expect(taskCompleteHandler).not.toHaveBeenCalled();

    // After debounce period, timer fires and transitions
    vi.advanceTimersByTime(1500);
    expect(taskCompleteHandler).toHaveBeenCalledTimes(1);
    expect(statusHandler).toHaveBeenCalledWith('ready');
    expect(internals._status).toBe('ready');
  });
});

describe('Max stall emission count', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should stop emitting after MAX_STALL_EMISSIONS', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const internals = getInternals(session);
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Working on task...');

    // Fire stall 5 times with still_working classifications between each.
    // Each still_working doubles the backoff, so advance by the correct amount.
    let backoff = 3000;
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(backoff);
      // Classify as still_working to allow re-emission (resets dedup hash)
      session.handleStallClassification({ state: 'still_working' });
      backoff = Math.min(backoff * 2, 30000);
    }

    expect(stallHandler).toHaveBeenCalledTimes(5);

    // 6th stall — should be suppressed by circuit breaker
    vi.advanceTimersByTime(30000); // backoff has grown to cap
    expect(stallHandler).toHaveBeenCalledTimes(5); // Still 5, not 6
  });

  it('should reset stall emission count when new content arrives', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const internals = getInternals(session);
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'Working on task...');

    // Fire 4 stalls (tracking backoff from still_working)
    let backoff = 3000;
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(backoff);
      session.handleStallClassification({ state: 'still_working' });
      backoff = Math.min(backoff * 2, 30000);
    }

    expect(stallHandler).toHaveBeenCalledTimes(4);
    expect(internals._stallEmissionCount).toBe(4);

    // New real content arrives — resets emission count and backoff
    simulateOutput(session, ' new output arrived');
    expect(internals._stallEmissionCount).toBe(0);

    // Can now fire 5 more stalls (backoff resets to base on new content)
    backoff = 3000;
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(backoff);
      session.handleStallClassification({ state: 'still_working' });
      backoff = Math.min(backoff * 2, 30000);
    }

    expect(stallHandler).toHaveBeenCalledTimes(9); // 4 + 5
  });
});
