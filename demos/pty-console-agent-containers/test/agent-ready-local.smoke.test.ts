import { PTYManager, type SessionHandle } from '../../../packages/pty-manager/src/index';
import { PTYConsoleBridge } from '../../../packages/pty-console/src/index';
import { AiderAdapter } from '../../../packages/coding-agent-adapters/src/aider-adapter';
import { ClaudeAdapter } from '../../../packages/coding-agent-adapters/src/claude-adapter';
import { CodexAdapter } from '../../../packages/coding-agent-adapters/src/codex-adapter';
import { GeminiAdapter } from '../../../packages/coding-agent-adapters/src/gemini-adapter';
import { afterEach, describe, expect, it } from 'vitest';

type StartupResult = 'ready' | 'login_required' | 'blocking_prompt';
type AgentType = 'claude' | 'codex' | 'gemini' | 'aider';

const AGENTS: AgentType[] = ['claude', 'codex', 'gemini', 'aider'];
const STARTUP_TIMEOUT_MS = Number(process.env.PTY_CONSOLE_STARTUP_TIMEOUT_MS ?? 45_000);
const STRICT_READY = process.env.PTY_CONSOLE_STRICT_READY === '1';

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

describe('pty-console local CLI smoke', () => {
  it(
    'spawns local coding CLIs and surfaces startup states through pty-console',
    async () => {
      const manager = new PTYManager();
      activeManager = manager;

      manager.registerAdapter(new ClaudeAdapter());
      manager.registerAdapter(new CodexAdapter());
      manager.registerAdapter(new GeminiAdapter());
      manager.registerAdapter(new AiderAdapter());

      const bridge = new PTYConsoleBridge(manager, { maxBufferedCharsPerSession: 200_000 });
      activeBridge = bridge;

      const outputCharsBySession = new Map<string, number>();
      bridge.on('session_output', (event) => {
        outputCharsBySession.set(
          event.sessionId,
          (outputCharsBySession.get(event.sessionId) ?? 0) + event.data.length,
        );
      });

      const handles = await Promise.all(
        AGENTS.map((type) =>
          manager.spawn({
            name: `${type}-local`,
            type,
            workdir: process.cwd(),
            adapterConfig: { interactive: true },
            env: {
              ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
              OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
              GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? '',
              GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
            },
          }),
        ),
      );

      const startupResults = await Promise.all(
        handles.map((session) =>
          waitForStartupState({
            manager,
            bridge,
            session,
            timeoutMs: STARTUP_TIMEOUT_MS,
            requireReady: STRICT_READY,
          }),
        ),
      );

      const snapshot = bridge.getSnapshot();
      expect(snapshot).toHaveLength(AGENTS.length);

      const totalOutputChars = Array.from(outputCharsBySession.values()).reduce(
        (sum, count) => sum + count,
        0,
      );
      expect(totalOutputChars).toBeGreaterThan(0);

      if (STRICT_READY) {
        for (const result of startupResults) {
          expect(result.result).toBe('ready');
        }
      } else {
        for (const result of startupResults) {
          expect(['ready', 'login_required', 'blocking_prompt']).toContain(result.result);
        }
      }
    },
    180_000,
  );
});

async function waitForStartupState(options: {
  manager: PTYManager;
  bridge: PTYConsoleBridge;
  session: SessionHandle;
  timeoutMs: number;
  requireReady: boolean;
}): Promise<{ sessionId: string; result: StartupResult }> {
  const { manager, bridge, session, timeoutMs, requireReady } = options;
  if (manager.get(session.id)?.status === 'ready') {
    return { sessionId: session.id, result: 'ready' };
  }

  return new Promise((resolve, reject) => {
    let finished = false;

    const finish = (result: StartupResult): void => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve({ sessionId: session.id, result });
    };

    const fail = (reason: string): void => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(`${session.name} (${session.id}) failed startup: ${reason}`));
    };

    const onStatus = (event: {
      kind: string;
      session: SessionHandle;
      error?: string;
      reason?: string;
    }) => {
      if (event.session.id !== session.id) return;

      if (event.kind === 'ready') {
        finish('ready');
        return;
      }
      if (!requireReady && event.kind === 'login_required') {
        finish('login_required');
        return;
      }
      if (!requireReady && event.kind === 'blocking_prompt') {
        finish('blocking_prompt');
        return;
      }
      if (event.kind === 'error') {
        fail(event.error ?? 'session_error');
        return;
      }
      if (event.kind === 'stopped') {
        const buffered = bridge.getBufferedOutput(session.id);
        const inferred = inferStartupStateFromOutput(buffered);
        if (!requireReady && inferred) {
          finish(inferred);
          return;
        }
        if (!requireReady) {
          finish('blocking_prompt');
          return;
        }
        fail(event.reason ?? 'session_stopped');
      }
    };

    const poll = setInterval(() => {
      const handle = manager.get(session.id);
      if (!handle) {
        fail('session disappeared');
        return;
      }
      if (handle.status === 'ready') {
        finish('ready');
      }
    }, 250);

    const timeout = setTimeout(() => {
      const finalStatus = manager.get(session.id)?.status ?? 'missing';
      if (!requireReady) {
        finish('blocking_prompt');
        return;
      }
      fail(`timeout after ${timeoutMs}ms (status=${finalStatus})`);
    }, timeoutMs);

    const cleanup = () => {
      clearInterval(poll);
      clearTimeout(timeout);
      bridge.off('session_status', onStatus);
    };

    bridge.on('session_status', onStatus);
  });
}

function inferStartupStateFromOutput(output: string): StartupResult | null {
  const text = output.toLowerCase();
  if (
    /api key|authentication required|invalid api key|unauthorized|sign in|device code|oauth/.test(
      text,
    )
  ) {
    return 'login_required';
  }
  if (
    /trust|permission|allow|confirm|apply this change|continue|select|choose/.test(
      text,
    )
  ) {
    return 'blocking_prompt';
  }
  return null;
}
