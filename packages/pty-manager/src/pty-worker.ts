/**
 * PTY Worker Process
 *
 * A standalone Node.js process that can be spawned from non-Node runtimes (like Bun)
 * to handle PTY operations. Communicates via JSON over stdin/stdout.
 *
 * Commands (stdin):
 *   { "cmd": "spawn", "id": string, "config": SpawnConfig }
 *   { "cmd": "send", "id": string, "data": string }
 *   { "cmd": "sendKeys", "id": string, "keys": string | string[] }
 *   { "cmd": "paste", "id": string, "text": string, "bracketed"?: boolean }
 *   { "cmd": "resize", "id": string, "cols": number, "rows": number }
 *   { "cmd": "kill", "id": string, "signal"?: string }
 *   { "cmd": "list" }
 *   { "cmd": "shutdown" }
 *   { "cmd": "registerAdapters", "modules": string[] }  // Load adapter modules dynamically
 *
 * Events (stdout):
 *   { "event": "spawned", "id": string, "pid": number }
 *   { "event": "output", "id": string, "data": string }
 *   { "event": "ready", "id": string }
 *   { "event": "exit", "id": string, "code": number, "signal"?: string }
 *   { "event": "error", "id": string, "message": string }
 *   { "event": "blocking_prompt", "id": string, "promptInfo": BlockingPromptInfo, "autoResponded": boolean }
 *   { "event": "login_required", "id": string, "instructions"?: string, "url"?: string }
 *   { "event": "message", "message": SessionMessage }
 *   { "event": "question", "id": string, "question": string }
 *   { "event": "list", "sessions": SessionInfo[] }
 *   { "event": "ack", "cmd": string, "id"?: string, "success": boolean, "error"?: string }
 */

import * as readline from 'readline';
import { PTYManager } from './pty-manager';
import { ShellAdapter } from './adapters';
import type { SpawnConfig, SessionHandle, BlockingPromptInfo, SessionMessage } from './types';

interface SessionInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  pid: number | undefined;
  cols: number;
  rows: number;
  startedAt: string;
  lastActivityAt?: string;
  error?: string;
  exitCode?: number;
}

interface Command {
  cmd: string;
  id?: string;
  config?: SpawnConfig;
  data?: string;
  keys?: string | string[];
  text?: string;
  bracketed?: boolean;
  cols?: number;
  rows?: number;
  signal?: string;
  modules?: string[];
}

interface Event {
  event: string;
  id?: string;
  [key: string]: unknown;
}

// Create manager with shell adapter
const manager = new PTYManager();
manager.registerAdapter(new ShellAdapter());

// Track terminal attachments for sendKeys/paste
const attachments = new Map<string, ReturnType<typeof manager.attachTerminal>>();

function emit(event: Event): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}

function ack(cmd: string, id?: string, success = true, error?: string): void {
  emit({ event: 'ack', cmd, id, success, error });
}

// Forward manager events
manager.on('session_started', (handle: SessionHandle) => {
  emit({
    event: 'spawned',
    id: handle.id,
    name: handle.name,
    type: handle.type,
    pid: handle.pid,
    cols: 120, // Default cols
    rows: 40,  // Default rows
  });
});

manager.on('session_ready', (handle: SessionHandle) => {
  emit({ event: 'ready', id: handle.id });
});

manager.on('session_stopped', (handle: SessionHandle, reason: string) => {
  emit({
    event: 'exit',
    id: handle.id,
    code: handle.exitCode || 0,
    reason,
  });
  attachments.delete(handle.id);
});

manager.on('session_error', (handle: SessionHandle, error: string) => {
  emit({ event: 'error', id: handle.id, message: error });
});

manager.on('blocking_prompt', (handle: SessionHandle, promptInfo: BlockingPromptInfo, autoResponded: boolean) => {
  emit({
    event: 'blocking_prompt',
    id: handle.id,
    promptInfo,
    autoResponded,
  });
});

manager.on('login_required', (handle: SessionHandle, instructions?: string, url?: string) => {
  emit({
    event: 'login_required',
    id: handle.id,
    instructions,
    url,
  });
});

manager.on('message', (message: SessionMessage) => {
  emit({
    event: 'message',
    message: {
      ...message,
      timestamp: message.timestamp.toISOString(),
    },
  });
});

manager.on('question', (handle: SessionHandle, question: string) => {
  emit({
    event: 'question',
    id: handle.id,
    question,
  });
});

async function handleSpawn(id: string, config: SpawnConfig): Promise<void> {
  try {
    if (manager.has(id)) {
      ack('spawn', id, false, `Session ${id} already exists`);
      return;
    }

    const handle = await manager.spawn({ ...config, id });

    // Attach to get output
    const attachment = manager.attachTerminal(handle.id);
    if (attachment) {
      attachments.set(handle.id, attachment);
      attachment.onData((data: string) => {
        emit({ event: 'output', id: handle.id, data });
      });
    }

    ack('spawn', id, true);
  } catch (err) {
    ack('spawn', id, false, err instanceof Error ? err.message : String(err));
  }
}

function handleSend(id: string, data: string): void {
  try {
    const attachment = attachments.get(id);
    if (!attachment) {
      ack('send', id, false, `Session ${id} not found or not attached`);
      return;
    }

    attachment.write(data);
    ack('send', id, true);
  } catch (err) {
    ack('send', id, false, err instanceof Error ? err.message : String(err));
  }
}

function handleSendKeys(id: string, keys: string | string[]): void {
  try {
    const session = manager.getSession(id);
    if (!session) {
      ack('sendKeys', id, false, `Session ${id} not found`);
      return;
    }

    session.sendKeys(keys);
    ack('sendKeys', id, true);
  } catch (err) {
    ack('sendKeys', id, false, err instanceof Error ? err.message : String(err));
  }
}

function handlePaste(id: string, text: string, bracketed = true): void {
  try {
    const session = manager.getSession(id);
    if (!session) {
      ack('paste', id, false, `Session ${id} not found`);
      return;
    }

    session.paste(text, bracketed);
    ack('paste', id, true);
  } catch (err) {
    ack('paste', id, false, err instanceof Error ? err.message : String(err));
  }
}

function handleResize(id: string, cols: number, rows: number): void {
  try {
    const attachment = attachments.get(id);
    if (!attachment) {
      ack('resize', id, false, `Session ${id} not found or not attached`);
      return;
    }

    attachment.resize(cols, rows);
    ack('resize', id, true);
  } catch (err) {
    ack('resize', id, false, err instanceof Error ? err.message : String(err));
  }
}

async function handleKill(id: string): Promise<void> {
  try {
    await manager.stop(id);
    ack('kill', id, true);
  } catch (err) {
    ack('kill', id, false, err instanceof Error ? err.message : String(err));
  }
}

function handleList(): void {
  const sessions = manager.list();
  const sessionList: SessionInfo[] = sessions.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    status: s.status,
    pid: s.pid,
    cols: 120,
    rows: 40,
    startedAt: s.startedAt?.toISOString() || new Date().toISOString(),
    lastActivityAt: s.lastActivityAt?.toISOString(),
    error: s.error,
    exitCode: s.exitCode,
  }));

  emit({ event: 'list', sessions: sessionList });
}

async function handleShutdown(): Promise<void> {
  try {
    await manager.shutdown();
    ack('shutdown', undefined, true);
  } catch (err) {
    ack('shutdown', undefined, false, err instanceof Error ? err.message : String(err));
  }

  // Exit after a brief delay to ensure ack is sent
  setTimeout(() => process.exit(0), 100);
}

function handleRegisterAdapters(modules: string[]): void {
  try {
    for (const modulePath of modules) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(modulePath);

      // Try createAllAdapters() first (coding-agent-adapters pattern)
      if (typeof mod.createAllAdapters === 'function') {
        const adapters = mod.createAllAdapters();
        for (const adapter of adapters) {
          manager.registerAdapter(adapter);
        }
      }
      // Fall back to default export if it's an array of adapters
      else if (Array.isArray(mod.default)) {
        for (const adapter of mod.default) {
          manager.registerAdapter(adapter);
        }
      }
      // Or if default is a single adapter
      else if (mod.default && typeof mod.default.adapterType === 'string') {
        manager.registerAdapter(mod.default);
      }
      else {
        throw new Error(`Module ${modulePath} does not export createAllAdapters() or adapters`);
      }
    }
    ack('registerAdapters', undefined, true);
  } catch (err) {
    ack('registerAdapters', undefined, false, err instanceof Error ? err.message : String(err));
  }
}

function processCommand(line: string): void {
  let command: Command;

  try {
    command = JSON.parse(line);
  } catch {
    emit({ event: 'error', message: 'Invalid JSON command' });
    return;
  }

  switch (command.cmd) {
    case 'spawn':
      if (!command.id || !command.config) {
        ack('spawn', command.id, false, 'Missing id or config');
        return;
      }
      handleSpawn(command.id, command.config);
      break;

    case 'send':
      if (!command.id || command.data === undefined) {
        ack('send', command.id, false, 'Missing id or data');
        return;
      }
      handleSend(command.id, command.data);
      break;

    case 'sendKeys':
      if (!command.id || !command.keys) {
        ack('sendKeys', command.id, false, 'Missing id or keys');
        return;
      }
      handleSendKeys(command.id, command.keys);
      break;

    case 'paste':
      if (!command.id || command.text === undefined) {
        ack('paste', command.id, false, 'Missing id or text');
        return;
      }
      handlePaste(command.id, command.text, command.bracketed);
      break;

    case 'resize':
      if (!command.id || !command.cols || !command.rows) {
        ack('resize', command.id, false, 'Missing id, cols, or rows');
        return;
      }
      handleResize(command.id, command.cols, command.rows);
      break;

    case 'kill':
      if (!command.id) {
        ack('kill', command.id, false, 'Missing id');
        return;
      }
      handleKill(command.id);
      break;

    case 'list':
      handleList();
      break;

    case 'shutdown':
      handleShutdown();
      break;

    case 'registerAdapters':
      if (!command.modules || !Array.isArray(command.modules)) {
        ack('registerAdapters', undefined, false, 'Missing modules array');
        return;
      }
      handleRegisterAdapters(command.modules);
      break;

    default:
      emit({ event: 'error', message: `Unknown command: ${command.cmd}` });
  }
}

// Set up readline for stdin processing
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', processCommand);

rl.on('close', () => {
  // Stdin closed, shutdown gracefully
  handleShutdown();
});

// Handle process signals
process.on('SIGTERM', () => handleShutdown());
process.on('SIGINT', () => handleShutdown());

// Signal ready
emit({ event: 'worker_ready' });
