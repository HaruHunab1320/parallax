/**
 * Blocking Prompt Deduplication Tests
 *
 * Tests the normalized hash used to deduplicate blocking_prompt events.
 * The hash collapses whitespace, normalizes numbers, trims, and caps length
 * so TUI re-renders with minor text differences don't trigger duplicate events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PTYSession } from '../src/pty-session';
import type { CLIAdapter } from '../src/adapters/adapter-interface';

function createBlockingAdapter(promptText: string): CLIAdapter {
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
    detectBlockingPrompt: () => ({
      detected: true,
      type: 'permission' as const,
      prompt: promptText,
    }),
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

function createSessionWithAdapter(adapter: CLIAdapter): PTYSession {
  const session = new PTYSession(
    adapter,
    { name: 'test', type: 'test' },
    silentLogger as never,
    false, // disable stall detection for these tests
  );

  const internals = getInternals(session);
  internals._status = 'busy';
  internals.ptyProcess = {
    write: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
    resize: vi.fn(),
  };

  return session;
}

describe('blocking prompt deduplication', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits blocking_prompt on first detection', () => {
    const adapter = createBlockingAdapter('Allow write to /src/index.ts?');
    const session = createSessionWithAdapter(adapter);

    const handler = vi.fn();
    session.on('blocking_prompt', handler);

    // Trigger output processing
    const internals = getInternals(session);
    internals.outputBuffer = 'Allow write to /src/index.ts?';
    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('does NOT re-emit for identical prompt text', () => {
    const adapter = createBlockingAdapter('Allow write to /src/index.ts?');
    const session = createSessionWithAdapter(adapter);

    const handler = vi.fn();
    session.on('blocking_prompt', handler);

    const internals = getInternals(session);
    internals.outputBuffer = 'Allow write to /src/index.ts?';

    const process = () =>
      (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();

    process(); // First detection → emits
    process(); // Same prompt → deduplicated

    expect(handler).toHaveBeenCalledOnce();
  });

  it('deduplicates prompts with different whitespace', () => {
    // First call: normal spacing
    const adapter1 = createBlockingAdapter('Allow write to  /src/index.ts?');
    const session = createSessionWithAdapter(adapter1);

    const handler = vi.fn();
    session.on('blocking_prompt', handler);

    const internals = getInternals(session);
    internals.outputBuffer = 'Allow write to  /src/index.ts?';

    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();
    expect(handler).toHaveBeenCalledOnce();

    // Swap adapter to one with different whitespace in the prompt
    // but same semantic content — simulates TUI re-render
    (session as unknown as { adapter: CLIAdapter }).adapter =
      createBlockingAdapter('Allow  write   to /src/index.ts?');
    internals.outputBuffer = 'Allow  write   to /src/index.ts?';

    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();

    // Should still be 1 — normalized hash matches
    expect(handler).toHaveBeenCalledOnce();
  });

  it('deduplicates prompts with different line numbers', () => {
    const adapter1 = createBlockingAdapter('Allow write to line 42 of /src/index.ts?');
    const session = createSessionWithAdapter(adapter1);

    const handler = vi.fn();
    session.on('blocking_prompt', handler);

    const internals = getInternals(session);
    internals.outputBuffer = 'dummy';
    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();
    expect(handler).toHaveBeenCalledOnce();

    // Same prompt but line number changed (TUI re-render)
    (session as unknown as { adapter: CLIAdapter }).adapter =
      createBlockingAdapter('Allow write to line 99 of /src/index.ts?');
    internals.outputBuffer = 'dummy2';
    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();

    // Numbers normalized to '#' → same hash
    expect(handler).toHaveBeenCalledOnce();
  });

  it('emits again for genuinely different prompt', () => {
    const adapter = createBlockingAdapter('Allow write to /src/index.ts?');
    const session = createSessionWithAdapter(adapter);

    const handler = vi.fn();
    session.on('blocking_prompt', handler);

    const internals = getInternals(session);
    internals.outputBuffer = 'dummy';
    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();
    expect(handler).toHaveBeenCalledOnce();

    // Different prompt entirely
    (session as unknown as { adapter: CLIAdapter }).adapter =
      createBlockingAdapter('Allow delete of /src/main.ts?');
    internals.outputBuffer = 'dummy2';
    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('does NOT re-emit same prompt after notifyHookEvent(permission_approved)', () => {
    const adapter = createBlockingAdapter('Allow write to /src/index.ts?');
    const session = createSessionWithAdapter(adapter);

    const handler = vi.fn();
    session.on('blocking_prompt', handler);

    const internals = getInternals(session);
    internals.outputBuffer = 'dummy';
    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();
    expect(handler).toHaveBeenCalledOnce();

    // permission_approved preserves the hash to prevent TUI re-render floods
    session.notifyHookEvent('permission_approved');

    // Same prompt again — should NOT emit because hash is preserved
    internals.outputBuffer = 'dummy2';
    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();
    expect(handler).toHaveBeenCalledOnce(); // still 1, not 2
  });

  it('deduplicates prompts longer than 100 chars by truncation', () => {
    const longPrompt = 'A'.repeat(200);
    const adapter1 = createBlockingAdapter(longPrompt);
    const session = createSessionWithAdapter(adapter1);

    const handler = vi.fn();
    session.on('blocking_prompt', handler);

    const internals = getInternals(session);
    internals.outputBuffer = 'dummy';
    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();
    expect(handler).toHaveBeenCalledOnce();

    // Same prefix but different tail after 100 chars
    const samePrefix = 'A'.repeat(100) + 'B'.repeat(100);
    (session as unknown as { adapter: CLIAdapter }).adapter =
      createBlockingAdapter(samePrefix);
    internals.outputBuffer = 'dummy2';
    (session as unknown as { processOutputBuffer: () => void }).processOutputBuffer();

    // First 100 chars identical after normalization → same hash
    expect(handler).toHaveBeenCalledOnce();
  });
});
