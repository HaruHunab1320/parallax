import { afterEach, describe, expect, it } from 'vitest';
import { ClaudeAdapter } from '../../../packages/coding-agent-adapters/src/claude-adapter';
import { GeminiAdapter } from '../../../packages/coding-agent-adapters/src/gemini-adapter';
import { PTYConsoleBridge } from '../../../packages/pty-console/src/index';
import {
  PTYManager,
  type SessionHandle,
} from '../../../packages/pty-manager/src/index';

type EventKind = 'blocking_prompt' | 'ready';

class MockClaudeHookAdapter extends ClaudeAdapter {
  override getCommand(): string {
    return process.execPath;
  }

  override getArgs(): string[] {
    const script = [
      'const lines = [',
      '\'PARALLAX_CLAUDE_HOOK {"event":"Notification","notification_type":"permission_prompt","message":"Allow?"}\\n\',',
      '\'PARALLAX_CLAUDE_HOOK {"event":"PreToolUse","tool_name":"Bash"}\\n\',',
      '\'PARALLAX_CLAUDE_HOOK {"event":"TaskCompleted"}\\n\',',
      "'How can I help you today?\\n',",
      '\'PARALLAX_CLAUDE_HOOK {"event":"SessionEnd"}\\n\',',
      '];',
      'let i = 0;',
      'const emit = () => {',
      '  if (i >= lines.length) { setTimeout(() => process.exit(0), 150); return; }',
      '  process.stdout.write(lines[i++]);',
      '  setTimeout(emit, 100);',
      '};',
      'emit();',
    ].join('');
    return ['-e', script];
  }
}

class MockGeminiHookAdapter extends GeminiAdapter {
  override getCommand(): string {
    return process.execPath;
  }

  override getArgs(): string[] {
    const script = [
      'const lines = [',
      '\'PARALLAX_GEMINI_HOOK {"event":"Notification","notification_type":"ToolPermission","message":"Allow?"}\\n\',',
      '\'PARALLAX_GEMINI_HOOK {"event":"BeforeTool","tool_name":"run_shell_command"}\\n\',',
      '\'PARALLAX_GEMINI_HOOK {"event":"AfterAgent"}\\n\',',
      "'> Type your message or @path/to/file\\n',",
      '\'PARALLAX_GEMINI_HOOK {"event":"SessionEnd"}\\n\',',
      '];',
      'let i = 0;',
      'const emit = () => {',
      '  if (i >= lines.length) { setTimeout(() => process.exit(0), 150); return; }',
      '  process.stdout.write(lines[i++]);',
      '  setTimeout(emit, 100);',
      '};',
      'emit();',
    ].join('');
    return ['-e', script];
  }
}

let activeManager: PTYManager | null = null;
let activeBridge: PTYConsoleBridge | null = null;

afterEach(async () => {
  if (activeBridge) {
    activeBridge.close();
    activeBridge = null;
  }
  if (activeManager) {
    await activeManager.stopAll({ force: true, timeout: 2000 });
    activeManager = null;
  }
});

describe('hook marker PTY smoke', () => {
  it('emits blocking_prompt and ready from Claude/Gemini hook markers', async () => {
    const manager = new PTYManager();
    activeManager = manager;

    manager.registerAdapter(new MockClaudeHookAdapter());
    manager.registerAdapter(new MockGeminiHookAdapter());

    const bridge = new PTYConsoleBridge(manager, {
      maxBufferedCharsPerSession: 50_000,
    });
    activeBridge = bridge;

    const claude = await manager.spawn({
      name: 'claude-hook-smoke',
      type: 'claude',
      workdir: process.cwd(),
      readySettleMs: 40,
      adapterConfig: { interactive: true },
    });

    const gemini = await manager.spawn({
      name: 'gemini-hook-smoke',
      type: 'gemini',
      workdir: process.cwd(),
      readySettleMs: 40,
      adapterConfig: { interactive: true },
    });

    await Promise.all([
      waitForKinds(bridge, claude.id, ['blocking_prompt', 'ready'], 6000),
      waitForKinds(bridge, gemini.id, ['blocking_prompt', 'ready'], 6000),
    ]);

    // Ensure hook markers actually traversed the PTY output path.
    expect(bridge.getBufferedOutput(claude.id)).toContain(
      '"event":"PreToolUse"'
    );
    expect(bridge.getBufferedOutput(gemini.id)).toContain(
      '"event":"BeforeTool"'
    );
  }, 20_000);
});

function waitForKinds(
  bridge: PTYConsoleBridge,
  sessionId: string,
  required: EventKind[],
  timeoutMs: number
): Promise<void> {
  const seen = new Set<EventKind>();
  return new Promise((resolve, reject) => {
    const doneIfComplete = () => {
      if (required.every((k) => seen.has(k))) {
        cleanup();
        resolve();
      }
    };

    const onStatus = (event: { kind: string; session: SessionHandle }) => {
      if (event.session.id !== sessionId) return;
      if (event.kind === 'blocking_prompt' || event.kind === 'ready') {
        seen.add(event.kind);
      }
      doneIfComplete();
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `timeout waiting for ${required.join(', ')} on ${sessionId}; seen=${Array.from(seen).join(', ')}`
        )
      );
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      bridge.off('session_status', onStatus);
    };

    bridge.on('session_status', onStatus);
  });
}
