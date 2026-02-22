import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { SessionHandle } from '../../../packages/pty-manager-internal-tracing/src/types.ts';
import * as InternalPTYManagerModule from '../../../packages/pty-manager-internal-tracing/src/pty-manager.ts';
import { ClaudeAdapter } from '../../../packages/coding-agent-adapters/src/claude-adapter.ts';

const PTYManager = (InternalPTYManagerModule as { PTYManager?: typeof import('../../../packages/pty-manager-internal-tracing/src/pty-manager.ts')['PTYManager'] }).PTYManager
  ?? ((InternalPTYManagerModule as { default?: { PTYManager?: typeof import('../../../packages/pty-manager-internal-tracing/src/pty-manager.ts')['PTYManager'] } }).default?.PTYManager as typeof import('../../../packages/pty-manager-internal-tracing/src/pty-manager.ts')['PTYManager']);

if (!PTYManager) {
  throw new Error('Failed to resolve PTYManager from pty-manager-internal-tracing');
}

function createManagerLogger() {
  const verbose = process.env.PTY_CAPTURE_VERBOSE === '1';
  return {
    debug: (...args: unknown[]) => {
      if (!verbose) return;
      if (typeof args[0] === 'string') {
        console.debug(args[0], args[1]);
      } else {
        console.debug(args[1], args[0]);
      }
    },
    info: (...args: unknown[]) => {
      if (!verbose) return;
      if (typeof args[0] === 'string') {
        console.info(args[0], args[1]);
      } else {
        console.info(args[1], args[0]);
      }
    },
    warn: (...args: unknown[]) => {
      if (!verbose) return;
      if (typeof args[0] === 'string') {
        console.warn(args[0], args[1]);
      } else {
        console.warn(args[1], args[0]);
      }
    },
    error: (...args: unknown[]) => {
      if (typeof args[0] === 'string') {
        console.error(args[0], args[1]);
      } else {
        console.error(args[1], args[0]);
      }
    },
  };
}

interface CliArgs {
  workdir: string;
  outputDir: string;
  cols: number;
  rows: number;
  renderMode: 'raw' | 'plain';
}

function parseArgs(argv: string[]): CliArgs {
  const stdoutCols = process.stdout.columns || 140;
  const stdoutRows = process.stdout.rows || 45;

  const out: CliArgs = {
    workdir: resolve(process.env.CLAUDE_CAPTURE_WORKDIR ?? process.cwd()),
    outputDir: resolve(process.env.CLAUDE_CAPTURE_OUTPUT_DIR ?? '.parallax/pty-captures'),
    cols: Number.parseInt(process.env.CLAUDE_CAPTURE_COLS ?? String(stdoutCols), 10),
    rows: Number.parseInt(process.env.CLAUDE_CAPTURE_ROWS ?? String(stdoutRows), 10),
    renderMode: process.env.CLAUDE_CAPTURE_RENDER === 'plain' ? 'plain' : 'raw',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--workdir' && argv[i + 1]) {
      out.workdir = resolve(argv[++i]);
      continue;
    }
    if (arg === '--output-dir' && argv[i + 1]) {
      out.outputDir = resolve(argv[++i]);
      continue;
    }
    if (arg === '--cols' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(parsed) && parsed > 0) out.cols = parsed;
      continue;
    }
    if (arg === '--rows' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(parsed) && parsed > 0) out.rows = parsed;
      continue;
    }
    if (arg === '--render' && argv[i + 1]) {
      const mode = argv[++i];
      if (mode === 'raw' || mode === 'plain') {
        out.renderMode = mode;
      }
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
Claude Interactive Capture

Usage:
  tsx scripts/claude-interactive-capture.ts [options]

Options:
  --workdir <path>        Session working directory (default: cwd)
  --output-dir <path>     Capture output root dir (default: .parallax/pty-captures)
  --cols <n>              Initial terminal columns (default: current terminal cols)
  --rows <n>              Initial terminal rows (default: current terminal rows)
  --render <raw|plain>    Display mode (default: raw; plain reduces TUI flicker)
  -h, --help              Show this help

Exit:
  - Type /exit inside Claude, or
  - Press Ctrl+] in this wrapper

Env:
  CLAUDE_CAPTURE_WORKDIR
  CLAUDE_CAPTURE_OUTPUT_DIR
  CLAUDE_CAPTURE_COLS
  CLAUDE_CAPTURE_ROWS
  CLAUDE_CAPTURE_RENDER    raw | plain
  `);
}

function toPlainDisplay(data: string): string {
  // Preserve readable text but drop heavy cursor controls that cause jumpy repainting.
  let out = data;
  out = out.replace(/\x1b\[\d*(?:;\d+)*[ABCDGHfJKmSTu]/g, ' ');
  out = out.replace(/\x1b\[\?[0-9;]*[hl]/g, ' ');
  out = out.replace(/\x1b\][^\x07]*\x07/g, ' ');
  out = out.replace(/\r/g, '\n');
  out = out.replace(/[│╭╰╮╯─═╌║╔╗╚╝╠╣╦╩╬┌┐└┘├┤┬┴┼⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✶✳✢⏺]/g, ' ');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Interactive capture requires a TTY (run in a normal terminal)');
  }
  const runId = `claude-interactive-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const captureDir = join(args.outputDir, runId);
  await mkdir(captureDir, { recursive: true });

  const manager = new PTYManager({
    logger: createManagerLogger(),
    capture: {
      enabled: true,
      outputRootDir: captureDir,
      writeRawEvents: true,
      writeStates: true,
      writeTransitions: true,
      writeLifecycle: true,
      maxNormalizedBufferChars: 50000,
    },
  });
  manager.registerAdapter(new ClaudeAdapter());

  let session: SessionHandle | null = null;
  let detached = false;
  let stdinRawEnabled = false;
  let cleanupDone = false;
  let sessionClosed = false;
  let unsubOutput: (() => void) | null = null;

  const teardown = async (reason: string): Promise<void> => {
    if (cleanupDone) return;
    cleanupDone = true;

    if (unsubOutput) {
      unsubOutput();
      unsubOutput = null;
    }

    process.stdin.off('data', onStdinData);
    process.off('SIGWINCH', onResize);
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);

    if (stdinRawEnabled && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();

    if (session && !sessionClosed) {
      try {
        await manager.stop(session.id, { force: true, timeout: 2000 });
      } catch {
        // Session may already be gone.
      }
    }
    await manager.shutdown();

    const snapshot = session ? manager.getCaptureSnapshot(session.id) : null;
    process.stderr.write(`\n[claude-capture] stopped (${reason})\n`);
    if (snapshot) {
      process.stderr.write(`[claude-capture] raw: ${snapshot.paths.rawEventsPath}\n`);
      process.stderr.write(`[claude-capture] states: ${snapshot.paths.statesPath}\n`);
      process.stderr.write(`[claude-capture] transitions: ${snapshot.paths.transitionsPath}\n`);
      process.stderr.write(`[claude-capture] lifecycle: ${snapshot.paths.lifecyclePath}\n`);
      process.stderr.write(`[claude-capture] final-state: ${snapshot.state.state} (${snapshot.state.ruleId ?? 'no-rule'})\n`);
    }
  };

  const onResize = (): void => {
    if (!session) return;
    const attachment = manager.attachTerminal(session.id);
    if (!attachment) return;
    attachment.resize(process.stdout.columns || args.cols, process.stdout.rows || args.rows);
  };

  const onStdinData = (chunk: Buffer | string): void => {
    if (!session) return;
    const attachment = manager.attachTerminal(session.id);
    if (!attachment) return;
    const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (data === '\u001d') {
      detached = true;
      void teardown('manual-detach');
      return;
    }
    attachment.write(data);
  };

  const onSigint = (): void => {
    if (!detached) {
      detached = true;
      void teardown('sigint');
    }
  };

  const onSigterm = (): void => {
    if (!detached) {
      detached = true;
      void teardown('sigterm');
    }
  };

  manager.on('session_stopped', (stopped, reason) => {
    if (!session || stopped.id !== session.id) return;
    sessionClosed = true;
    if (!detached) {
      detached = true;
      void teardown(reason);
    }
  });

  manager.on('session_error', (errored, error) => {
    if (!session || errored.id !== session.id) return;
    process.stderr.write(`\n[claude-capture] session_error: ${error}\n`);
  });

  manager.on('auth_required', (authSession, info) => {
    if (!session || authSession.id !== session.id) return;
    const suffix = info.url ? ` ${info.url}` : '';
    process.stderr.write(`\n[claude-capture] auth_required: ${info.method}${suffix}\n`);
  });

  session = await manager.spawn({
    name: 'claude-interactive-capture',
    type: 'claude',
    workdir: args.workdir,
    cols: args.cols,
    rows: args.rows,
    adapterConfig: {
      interactive: true,
    },
  });

  const attachment = manager.attachTerminal(session.id);
  if (!attachment) {
    await teardown('attach_failed');
    throw new Error(`Failed to attach terminal stream for session ${session.id}`);
  }

  process.stderr.write(`[claude-capture] session=${session.id}\n`);
  process.stderr.write(`[claude-capture] run-id=${runId}\n`);
  process.stderr.write(`[claude-capture] render=${args.renderMode}\n`);
  process.stderr.write('[claude-capture] press Ctrl+] to detach\n\n');

  unsubOutput = attachment.onData((data) => {
    process.stdout.write(args.renderMode === 'plain' ? toPlainDisplay(data) : data);
  });

  process.stdin.setRawMode(true);
  stdinRawEnabled = true;
  process.stdin.resume();
  process.stdin.on('data', onStdinData);
  process.on('SIGWINCH', onResize);
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  await new Promise<void>((resolvePromise) => {
    const poll = (): void => {
      if (detached) {
        resolvePromise();
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

main().catch((error) => {
  console.error('claude-interactive-capture failed:', error);
  process.exitCode = 1;
});
