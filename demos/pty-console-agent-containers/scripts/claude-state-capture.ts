import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionHandle } from '../../../packages/pty-manager-internal-tracing/src/types.ts';
import * as InternalPTYManagerModule from '../../../packages/pty-manager-internal-tracing/src/pty-manager.ts';
import { ClaudeAdapter } from '../../../packages/coding-agent-adapters/src/claude-adapter.ts';

const PTYManager = (InternalPTYManagerModule as { PTYManager?: typeof import('../../../packages/pty-manager-internal-tracing/src/pty-manager.ts')['PTYManager'] }).PTYManager
  ?? ((InternalPTYManagerModule as { default?: { PTYManager?: typeof import('../../../packages/pty-manager-internal-tracing/src/pty-manager.ts')['PTYManager'] } }).default?.PTYManager as typeof import('../../../packages/pty-manager-internal-tracing/src/pty-manager.ts')['PTYManager']);

if (!PTYManager) {
  throw new Error('Failed to resolve PTYManager from pty-manager-internal-tracing');
}

interface CliArgs {
  prompt?: string;
  timeoutMs: number;
  outputDir: string;
  workdir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    timeoutMs: Number.parseInt(process.env.CLAUDE_CAPTURE_TIMEOUT_MS ?? '120000', 10),
    outputDir: resolve(process.env.CLAUDE_CAPTURE_OUTPUT_DIR ?? '.parallax/pty-captures'),
    workdir: resolve(process.env.CLAUDE_CAPTURE_WORKDIR ?? process.cwd()),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--prompt' && argv[i + 1]) {
      out.prompt = argv[++i];
      continue;
    }
    if (arg === '--timeout-ms' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(parsed) && parsed > 0) out.timeoutMs = parsed;
      continue;
    }
    if (arg === '--output-dir' && argv[i + 1]) {
      out.outputDir = resolve(argv[++i]);
      continue;
    }
    if (arg === '--workdir' && argv[i + 1]) {
      out.workdir = resolve(argv[++i]);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return out;
}

function printHelp(): void {
  console.log(`
Claude State Capture Demo

Usage:
  tsx scripts/claude-state-capture.ts [options]

Options:
  --prompt <text>         Send one prompt after startup
  --timeout-ms <ms>       Stop after timeout (default: 120000)
  --output-dir <path>     Capture output root dir (default: .parallax/pty-captures)
  --workdir <path>        Session working directory (default: cwd)
  -h, --help              Show this help

Env:
  CLAUDE_CAPTURE_TIMEOUT_MS
  CLAUDE_CAPTURE_OUTPUT_DIR
  CLAUDE_CAPTURE_WORKDIR
  `);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = `claude-capture-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const captureDir = join(args.outputDir, runId);
  await mkdir(captureDir, { recursive: true });

  const manager = new PTYManager({
    capture: {
      enabled: true,
      outputRootDir: captureDir,
      writeRawEvents: true,
      writeStates: true,
      writeTransitions: true,
      writeLifecycle: true,
      maxNormalizedBufferChars: 40000,
    },
  });

  manager.registerAdapter(new ClaudeAdapter());

  let currentSession: SessionHandle | null = null;
  let promptSent = false;

  manager.on('session_started', (session) => {
    currentSession = session;
    console.log(`[started] ${session.id} (${session.type})`);
  });

  manager.on('session_ready', (session) => {
    console.log(`[ready] ${session.id}`);
    if (args.prompt && !promptSent) {
      promptSent = true;
      manager.send(session.id, args.prompt);
      console.log(`[prompt] sent: ${truncate(args.prompt, 120)}`);
    }
  });

  manager.on('interaction_state_changed', (session, info) => {
    const rule = info.ruleId ? ` rule=${info.ruleId}` : '';
    const edge = info.transition ? ` ${info.transition.from}->${info.transition.to}` : '';
    console.log(`[state] ${session.id}${edge} state=${info.state} conf=${info.confidence.toFixed(2)}${rule}`);
  });

  manager.on('auth_required', (session, info) => {
    console.log(`[auth_required] ${session.id} method=${info.method} ${info.url ?? ''}`.trim());
  });

  manager.on('blocking_prompt', (session, prompt, autoResponded) => {
    console.log(
      `[blocking_prompt] ${session.id} type=${prompt.type} autoResponded=${autoResponded} prompt=${truncate(prompt.prompt ?? '', 120)}`,
    );
  });

  manager.on('session_error', (session, error) => {
    console.error(`[session_error] ${session.id}: ${error}`);
  });

  const session = await manager.spawn({
    name: 'claude-state-capture',
    type: 'claude',
    workdir: args.workdir,
    cols: 220,
    rows: 70,
  });
  currentSession = session;

  console.log(`capture run id: ${runId}`);
  console.log(`capture root: ${captureDir}`);
  console.log(`session id: ${session.id}`);
  console.log(`timeout: ${args.timeoutMs}ms`);

  await new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, args.timeoutMs);
  });

  const snapshot = currentSession ? manager.getCaptureSnapshot(currentSession.id) : null;
  if (snapshot) {
    console.log('\nCapture artifacts:');
    console.log(`- raw: ${snapshot.paths.rawEventsPath}`);
    console.log(`- states: ${snapshot.paths.statesPath}`);
    console.log(`- transitions: ${snapshot.paths.transitionsPath}`);
    console.log(`- lifecycle: ${snapshot.paths.lifecyclePath}`);
    console.log(`- finalState: ${snapshot.state.state} (${snapshot.state.ruleId ?? 'no-rule'})`);
  }

  await manager.stopAll({ force: true, timeout: 2000 });
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

main().catch(async (error) => {
  console.error('claude-state-capture failed:', error);
  process.exitCode = 1;
});
