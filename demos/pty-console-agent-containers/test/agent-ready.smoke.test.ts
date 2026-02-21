import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { PTYManager, type SessionHandle, type SpawnConfig } from '../../../packages/pty-manager/src/index';
import { PTYConsoleBridge } from '../../../packages/pty-console/src/index';
import { AiderAdapter } from '../../../packages/coding-agent-adapters/src/aider-adapter';
import { ClaudeAdapter } from '../../../packages/coding-agent-adapters/src/claude-adapter';
import { CodexAdapter } from '../../../packages/coding-agent-adapters/src/codex-adapter';
import { GeminiAdapter } from '../../../packages/coding-agent-adapters/src/gemini-adapter';
import { afterEach, describe, expect, it } from 'vitest';

type StartupResult = 'ready' | 'login_required' | 'blocking_prompt';
type AgentType = 'claude' | 'codex' | 'gemini' | 'aider';

const AGENTS: Array<{ type: AgentType; image: string }> = [
  { type: 'claude', image: 'parallax/agent-claude:latest' },
  { type: 'codex', image: 'parallax/agent-codex:latest' },
  { type: 'gemini', image: 'parallax/agent-gemini:latest' },
  { type: 'aider', image: 'parallax/agent-aider:latest' },
];

const STARTUP_TIMEOUT_MS = Number(process.env.PTY_CONSOLE_STARTUP_TIMEOUT_MS ?? 45_000);
const STRICT_READY = process.env.PTY_CONSOLE_STRICT_READY === '1';
const FALLBACK_OPENAI_KEY = process.env.OPENAI_API_KEY ?? readOpenAIKeyFromCodexAuthFile() ?? '';

class DockerizedClaudeAdapter extends ClaudeAdapter {
  override getCommand(): string {
    return 'docker';
  }
  override getArgs(config: SpawnConfig): string[] {
    return buildDockerArgs({
      agentType: 'claude',
      image: 'parallax/agent-claude:latest',
      innerCommand: super.getCommand(),
      innerArgs: super.getArgs(config),
      envMap: mergeEnvMaps(super.getEnv(config), config.env, [
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_MODEL',
        'CLAUDE_CODE_TELEMETRY',
      ]),
      workdir: config.workdir ?? process.cwd(),
      containerPrefix: 'claude-smoke',
    });
  }
  override getEnv(): Record<string, string> {
    return {};
  }
}

class DockerizedCodexAdapter extends CodexAdapter {
  override getCommand(): string {
    return 'docker';
  }
  override getArgs(config: SpawnConfig): string[] {
    return buildDockerArgs({
      agentType: 'codex',
      image: 'parallax/agent-codex:latest',
      innerCommand: super.getCommand(),
      innerArgs: super.getArgs(config),
      envMap: mergeEnvMaps(super.getEnv(config), config.env, [
        'OPENAI_API_KEY',
        'OPENAI_MODEL',
      ]),
      workdir: config.workdir ?? process.cwd(),
      containerPrefix: 'codex-smoke',
    });
  }
  override getEnv(): Record<string, string> {
    return {};
  }
}

class DockerizedGeminiAdapter extends GeminiAdapter {
  override getCommand(): string {
    return 'docker';
  }
  override getArgs(config: SpawnConfig): string[] {
    return buildDockerArgs({
      agentType: 'gemini',
      image: 'parallax/agent-gemini:latest',
      innerCommand: super.getCommand(),
      innerArgs: super.getArgs(config),
      envMap: mergeEnvMaps(super.getEnv(config), config.env, [
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
        'GEMINI_MODEL',
      ]),
      workdir: config.workdir ?? process.cwd(),
      containerPrefix: 'gemini-smoke',
    });
  }
  override getEnv(): Record<string, string> {
    return {};
  }
}

class DockerizedAiderAdapter extends AiderAdapter {
  override getCommand(): string {
    return 'docker';
  }
  override getArgs(config: SpawnConfig): string[] {
    return buildDockerArgs({
      agentType: 'aider',
      image: 'parallax/agent-aider:latest',
      innerCommand: super.getCommand(),
      innerArgs: super.getArgs(config),
      envMap: mergeEnvMaps(super.getEnv(config), config.env, [
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
        'AIDER_MODEL',
        'AIDER_YES',
        'AIDER_NO_AUTO_COMMITS',
      ]),
      workdir: config.workdir ?? process.cwd(),
      containerPrefix: 'aider-smoke',
    });
  }
  override getEnv(): Record<string, string> {
    return {};
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

describe('pty-console agent container smoke', () => {
  const dockerReady = hasDocker() && allImagesExist(AGENTS.map((a) => a.image));
  const runTest = dockerReady ? it : it.skip;

  runTest(
    'spawns each coding CLI in its own container and surfaces startup states through pty-console',
    async () => {
      const manager = new PTYManager();
      activeManager = manager;

      manager.registerAdapter(new DockerizedClaudeAdapter());
      manager.registerAdapter(new DockerizedCodexAdapter());
      manager.registerAdapter(new DockerizedGeminiAdapter());
      manager.registerAdapter(new DockerizedAiderAdapter());

      const bridge = new PTYConsoleBridge(manager, { maxBufferedCharsPerSession: 200_000 });
      activeBridge = bridge;

      const outputCharsBySession = new Map<string, number>();
      bridge.on('session_output', (event) => {
        outputCharsBySession.set(
          event.sessionId,
          (outputCharsBySession.get(event.sessionId) ?? 0) + event.data.length,
        );
      });

      const workdir = resolve(process.cwd(), '.');
      const handles = await Promise.all(
        AGENTS.map((agent) =>
          manager.spawn({
            name: `${agent.type}-container`,
            type: agent.type,
            workdir,
            adapterConfig: { interactive: true },
            env: {
              ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
              OPENAI_API_KEY: FALLBACK_OPENAI_KEY,
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

      for (const session of handles) {
        const outputCount = outputCharsBySession.get(session.id) ?? 0;
        expect(outputCount).toBeGreaterThan(0);
      }

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

function hasDocker(): boolean {
  const result = spawnSync('docker', ['info'], { encoding: 'utf-8' });
  return result.status === 0;
}

function allImagesExist(images: string[]): boolean {
  for (const image of images) {
    const result = spawnSync('docker', ['image', 'inspect', image], { encoding: 'utf-8' });
    if (result.status !== 0) {
      return false;
    }
  }
  return true;
}

function mergeEnvMaps(
  adapterEnv: Record<string, string>,
  spawnEnv: Record<string, string> | undefined,
  passthroughKeys: string[],
): Record<string, string> {
  const merged: Record<string, string> = { ...adapterEnv, ...(spawnEnv ?? {}) };
  for (const key of passthroughKeys) {
    const value = process.env[key];
    if (value && !(key in merged)) {
      merged[key] = value;
    }
  }
  return merged;
}

function buildDockerArgs(options: {
  agentType: AgentType;
  image: string;
  innerCommand: string;
  innerArgs: string[];
  envMap: Record<string, string>;
  workdir: string;
  containerPrefix: string;
}): string[] {
  const args = ['run', '--rm', '--pull=never', '-i', '-t'];
  const containerName = `${options.containerPrefix}-${randomUUID().slice(0, 8)}`;
  args.push('--name', containerName);
  args.push('-v', `${options.workdir}:/workspace`);
  args.push('-w', '/workspace');
  for (const mount of getAuthMounts(options.agentType)) {
    args.push('-v', `${mount.hostPath}:${mount.containerPath}:ro`);
  }

  for (const [key, value] of Object.entries(options.envMap)) {
    if (!value) continue;
    // Pass through environment by key only so secrets are not embedded in argv.
    args.push('-e', key);
  }

  args.push(options.image, options.innerCommand, ...options.innerArgs);
  return args;
}

function getAuthMounts(agentType: AgentType): Array<{ hostPath: string; containerPath: string }> {
  const home = homedir();
  const mounts: Array<{ hostPath: string; containerPath: string }> = [];
  const maybeAdd = (hostPath: string, containerPath: string) => {
    if (!existsSync(hostPath)) return;
    mounts.push({ hostPath, containerPath });
  };

  switch (agentType) {
    case 'codex':
      // Prefer passing OPENAI_API_KEY rather than mounting ~/.codex read-only,
      // because Codex may need to write runtime state in its home directory.
      break;
    case 'gemini':
      maybeAdd(join(home, '.gemini'), '/home/agent/.gemini');
      break;
    case 'claude':
      maybeAdd(join(home, '.claude'), '/home/agent/.claude');
      break;
    case 'aider':
      maybeAdd(join(home, '.aider.conf.yml'), '/home/agent/.aider.conf.yml');
      maybeAdd(join(home, '.aider'), '/home/agent/.aider');
      break;
  }

  return mounts;
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

function readOpenAIKeyFromCodexAuthFile(): string | null {
  try {
    const authPath = join(homedir(), '.codex', 'auth.json');
    if (!existsSync(authPath)) return null;
    const parsed = JSON.parse(readFileSync(authPath, 'utf-8')) as Record<string, unknown>;
    const key = parsed.OPENAI_API_KEY;
    return typeof key === 'string' && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

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
