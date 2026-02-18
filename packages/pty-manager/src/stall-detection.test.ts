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

  // In real PTYSession, onData calls resetStallTimer when busy
  // We call send() to trigger it, but since we're testing the timer directly,
  // we need to invoke the private resetStallTimer. We do this by calling
  // the method via bracket notation.
  if (internals._status === 'busy' && internals._stallDetectionEnabled) {
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

  it('should reset timer on null classification', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'output');

    // Wait for stall
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    // Classify as null (reset timer)
    session.handleStallClassification(null);

    // resetStallTimer clears _lastStallHash, so next fire will re-emit
    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(2);
  });

  it('should reset timer on still_working classification', () => {
    const { session } = createBusySession({ timeoutMs: 3000 });
    const stallHandler = vi.fn();
    session.on('stall_detected', stallHandler);

    simulateOutput(session, 'output');

    vi.advanceTimersByTime(3000);
    expect(stallHandler).toHaveBeenCalledTimes(1);

    session.handleStallClassification({ state: 'still_working' });

    // Timer was reset, fires again
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
