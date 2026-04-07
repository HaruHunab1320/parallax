/**
 * Loading detection API tests.
 *
 * Covers the public `isLoading()` method on PTYSession and the
 * `isSessionLoading(id)` method on PTYManager. These exist so higher-level
 * orchestrators (e.g. milady's swarm idle watchdog) can consult the
 * adapter's `detectLoading()` signal without reimplementing TUI heuristics
 * over raw terminal output.
 */

import { describe, expect, it, vi } from 'vitest';
import type { CLIAdapter } from '../src/adapters/adapter-interface';
import { PTYManager } from '../src/pty-manager';
import { PTYSession } from '../src/pty-session';

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

type SessionInternals = {
  outputBuffer: string;
};

function getInternals(session: PTYSession): SessionInternals {
  return session as unknown as SessionInternals;
}

/**
 * Build a minimal adapter stub. `detectLoading` can be overridden per test;
 * when omitted, it is absent from the adapter (simulating an adapter that
 * doesn't implement the optional method).
 */
function createAdapter(
  detectLoading?: (output: string) => boolean,
): CLIAdapter {
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
    parseOutput: () => null,
    getPromptPattern: () => /\$\s*$/,
    formatInput: (msg: string) => msg,
    validateInstallation: async () => ({ installed: true }),
    ...(detectLoading ? { detectLoading } : {}),
  };
}

function createSessionWithAdapter(adapter: CLIAdapter): PTYSession {
  const session = new PTYSession(
    adapter,
    { name: 'test', type: 'test' },
    silentLogger as never,
    false, // disable stall detection for these tests
  );

  // Stub the underlying pty process so we don't spawn real children.
  (
    session as unknown as {
      ptyProcess: {
        write: (data: string) => void;
        kill: (signal?: string) => void;
        pid: number;
        resize: (cols: number, rows: number) => void;
      } | null;
    }
  ).ptyProcess = {
    write: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
    resize: vi.fn(),
  };

  return session;
}

// ---------------------------------------------------------------------------
// PTYSession.isLoading()
// ---------------------------------------------------------------------------

describe('PTYSession.isLoading()', () => {
  it('returns true when the adapter reports loading for the current buffer', () => {
    const detectLoading = vi.fn((output: string) =>
      /esc to interrupt/i.test(output),
    );
    const session = createSessionWithAdapter(createAdapter(detectLoading));

    getInternals(session).outputBuffer = 'Working (12s • esc to interrupt)';
    expect(session.isLoading()).toBe(true);
    expect(detectLoading).toHaveBeenCalledWith(
      'Working (12s • esc to interrupt)',
    );
  });

  it('returns false when the adapter reports not loading', () => {
    const detectLoading = vi.fn(() => false);
    const session = createSessionWithAdapter(createAdapter(detectLoading));

    getInternals(session).outputBuffer = '> Ask Codex to do anything';
    expect(session.isLoading()).toBe(false);
  });

  it('returns false when the adapter does not implement detectLoading', () => {
    // Adapter created WITHOUT detectLoading → should fall through to false.
    const session = createSessionWithAdapter(createAdapter());

    getInternals(session).outputBuffer = 'Working (12s • esc to interrupt)';
    expect(session.isLoading()).toBe(false);
  });

  it('passes the full output buffer to detectLoading (not just a tail)', () => {
    // Regression guard for consumers who rely on detectLoading seeing the
    // same buffer the session maintains internally.
    const detectLoading = vi.fn(() => false);
    const session = createSessionWithAdapter(createAdapter(detectLoading));

    const buffer = 'a'.repeat(5000) + ' esc to interrupt';
    getInternals(session).outputBuffer = buffer;
    session.isLoading();

    expect(detectLoading).toHaveBeenCalledWith(buffer);
  });
});

// ---------------------------------------------------------------------------
// PTYManager.isSessionLoading(id)
// ---------------------------------------------------------------------------

describe('PTYManager.isSessionLoading(id)', () => {
  function createManager(): PTYManager {
    const manager = new PTYManager({ logger: silentLogger as never });
    return manager;
  }

  function registerSession(
    manager: PTYManager,
    id: string,
    adapter: CLIAdapter,
  ): PTYSession {
    const session = createSessionWithAdapter(adapter);
    // Reach into the private sessions map — the registration APIs all
    // spawn real child processes, which we don't want in a unit test.
    (
      manager as unknown as { sessions: Map<string, PTYSession> }
    ).sessions.set(id, session);
    return session;
  }

  it('returns false for unknown session ids', () => {
    const manager = createManager();
    expect(manager.isSessionLoading('does-not-exist')).toBe(false);
  });

  it('forwards to the registered session and returns true when loading', () => {
    const manager = createManager();
    const session = registerSession(
      manager,
      's-busy',
      createAdapter(() => true),
    );
    getInternals(session).outputBuffer = 'anything';
    expect(manager.isSessionLoading('s-busy')).toBe(true);
  });

  it('forwards to the registered session and returns false when not loading', () => {
    const manager = createManager();
    const session = registerSession(
      manager,
      's-idle',
      createAdapter(() => false),
    );
    getInternals(session).outputBuffer = 'ready';
    expect(manager.isSessionLoading('s-idle')).toBe(false);
  });

  it('returns false when the adapter does not implement detectLoading', () => {
    const manager = createManager();
    // No detectLoading on the adapter.
    registerSession(manager, 's-no-detect', createAdapter());
    expect(manager.isSessionLoading('s-no-detect')).toBe(false);
  });
});
