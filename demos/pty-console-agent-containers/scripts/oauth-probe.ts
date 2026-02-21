import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SessionHandle, SpawnConfig } from '../../../packages/pty-manager/src/types.ts';
import * as PTYManagerModule from '../../../packages/pty-manager/src/pty-manager.ts';
import * as PTYConsoleBridgeModule from '../../../packages/pty-console/src/pty-console-bridge.ts';
import * as CodexAdapterModule from '../../../packages/coding-agent-adapters/src/codex-adapter.ts';
import * as GeminiAdapterModule from '../../../packages/coding-agent-adapters/src/gemini-adapter.ts';

const PTYManager = (PTYManagerModule as { PTYManager?: typeof import('../../../packages/pty-manager/src/pty-manager.ts')['PTYManager'] }).PTYManager
  ?? ((PTYManagerModule as { default?: { PTYManager?: typeof import('../../../packages/pty-manager/src/pty-manager.ts')['PTYManager'] } }).default?.PTYManager as typeof import('../../../packages/pty-manager/src/pty-manager.ts')['PTYManager']);
const PTYConsoleBridge = (PTYConsoleBridgeModule as { PTYConsoleBridge?: typeof import('../../../packages/pty-console/src/pty-console-bridge.ts')['PTYConsoleBridge'] }).PTYConsoleBridge
  ?? ((PTYConsoleBridgeModule as { default?: { PTYConsoleBridge?: typeof import('../../../packages/pty-console/src/pty-console-bridge.ts')['PTYConsoleBridge'] } }).default?.PTYConsoleBridge as typeof import('../../../packages/pty-console/src/pty-console-bridge.ts')['PTYConsoleBridge']);
const CodexAdapter = (CodexAdapterModule as { CodexAdapter?: typeof import('../../../packages/coding-agent-adapters/src/codex-adapter.ts')['CodexAdapter'] }).CodexAdapter
  ?? ((CodexAdapterModule as { default?: { CodexAdapter?: typeof import('../../../packages/coding-agent-adapters/src/codex-adapter.ts')['CodexAdapter'] } }).default?.CodexAdapter as typeof import('../../../packages/coding-agent-adapters/src/codex-adapter.ts')['CodexAdapter']);
const GeminiAdapter = (GeminiAdapterModule as { GeminiAdapter?: typeof import('../../../packages/coding-agent-adapters/src/gemini-adapter.ts')['GeminiAdapter'] }).GeminiAdapter
  ?? ((GeminiAdapterModule as { default?: { GeminiAdapter?: typeof import('../../../packages/coding-agent-adapters/src/gemini-adapter.ts')['GeminiAdapter'] } }).default?.GeminiAdapter as typeof import('../../../packages/coding-agent-adapters/src/gemini-adapter.ts')['GeminiAdapter']);

if (!PTYManager || !PTYConsoleBridge || !CodexAdapter || !GeminiAdapter) {
  throw new Error('Failed to resolve required modules for OAuth probe script');
}

type AgentType = 'codex' | 'gemini';

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
      workdir: config.workdir ?? process.cwd(),
      envKeys: ['OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
      containerPrefix: 'codex-oauth',
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
      workdir: config.workdir ?? process.cwd(),
      envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
      containerPrefix: 'gemini-oauth',
    });
  }
  override getEnv(): Record<string, string> {
    return {};
  }
}

const OAUTH_TIMEOUT_MS = 90_000;
const manager = new PTYManager();
const bridge = new PTYConsoleBridge(manager, { maxBufferedCharsPerSession: 300_000 });

async function main(): Promise<void> {
  manager.registerAdapter(new DockerizedCodexAdapter());
  manager.registerAdapter(new DockerizedGeminiAdapter());

  const workdir = resolve(process.cwd(), '.');
  const sessions = await Promise.all([
    manager.spawn({
      name: 'codex-oauth-probe',
      type: 'codex',
      workdir,
      adapterConfig: { interactive: true },
      env: baseEnv(),
    }),
    manager.spawn({
      name: 'gemini-oauth-probe',
      type: 'gemini',
      workdir,
      adapterConfig: { interactive: true },
      env: baseEnv(),
    }),
  ]);

  const urls = await waitForUrls(sessions);

  console.log('\nOAuth probe results:');
  for (const [agent, value] of urls.entries()) {
    console.log(`- ${agent}: ${value ?? 'no URL captured'}`);
  }

  await manager.stopAll({ force: true, timeout: 2000 });
  bridge.close();
}

function baseEnv(): Record<string, string> {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  };
}

async function waitForUrls(
  sessions: SessionHandle[],
): Promise<Map<AgentType, string | null>> {
  const urls = new Map<AgentType, string | null>([
    ['codex', null],
    ['gemini', null],
  ]);

  const done = new Set<AgentType>();
  const keySendCount = new Map<string, number>();

  const extractUrl = (sessionId: string, text: string) => {
    const urlMatch = text.match(/https?:\/\/[^\s)]+/g);
    if (!urlMatch?.length) return;
    const handle = manager.get(sessionId);
    if (!handle) return;
    if ((handle.type !== 'codex' && handle.type !== 'gemini') || done.has(handle.type)) return;
    urls.set(handle.type, urlMatch[urlMatch.length - 1]);
    done.add(handle.type);
  };

  bridge.on('session_output', (event) => {
    extractUrl(event.sessionId, stripAnsi(event.data));
  });

  bridge.on('session_status', (event) => {
    const session = event.session;
    if (session.type !== 'codex' && session.type !== 'gemini') return;
    if (event.kind === 'login_required' || event.kind === 'blocking_prompt') {
      const count = (keySendCount.get(session.id) ?? 0) + 1;
      keySendCount.set(session.id, count);
      // Try likely auth-menu selections:
      // 1) default option
      // 2) one-down option (often device-code or alternate OAuth)
      if (count === 1) {
        manager.getSession(session.id)?.sendKeys(['enter']);
      } else if (count === 2) {
        manager.getSession(session.id)?.sendKeys(['down', 'enter']);
      }
      const buffered = stripAnsi(bridge.getBufferedOutput(session.id));
      extractUrl(session.id, buffered);
    }
  });

  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, OAUTH_TIMEOUT_MS);
    const poll = setInterval(() => {
      if (done.size === 2) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolvePromise();
      }
    }, 500);
  });

  return urls;
}

function buildDockerArgs(options: {
  agentType: AgentType;
  image: string;
  innerCommand: string;
  innerArgs: string[];
  workdir: string;
  envKeys: string[];
  containerPrefix: string;
}): string[] {
  const args = ['run', '--rm', '--pull=never', '-i', '-t'];
  args.push('--name', `${options.containerPrefix}-${randomUUID().slice(0, 8)}`);
  args.push('-v', `${options.workdir}:/workspace`);
  args.push('-w', '/workspace');

  for (const mount of getAuthMounts(options.agentType)) {
    args.push('-v', `${mount.hostPath}:${mount.containerPath}:ro`);
  }
  for (const key of options.envKeys) {
    if (process.env[key]) args.push('-e', key);
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

  if (agentType === 'gemini') {
    maybeAdd(join(home, '.gemini'), '/home/agent/.gemini');
  }

  return mounts;
}

function stripAnsi(input: string): string {
  return input
    .replace(/\x1b\[\d*[CDABGdEF]/g, ' ')
    .replace(/\x1b\[\d*(?:;\d+)?[Hf]/g, ' ')
    .replace(/\x1b\[\d*[JK]/g, ' ')
    .replace(/\x1b\](?:[^\x07\x1b]|\x1b[^\\])*(?:\x07|\x1b\\)/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

main().catch(async (err) => {
  console.error('OAuth probe failed:', err);
  await manager.stopAll({ force: true, timeout: 2000 }).catch(() => {});
  bridge.close();
  process.exitCode = 1;
});
