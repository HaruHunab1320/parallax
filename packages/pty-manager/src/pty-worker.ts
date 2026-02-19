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
 *   { "cmd": "registerAdapters", "modules": string[] }
 *   { "cmd": "addRule", "id": string, "rule": SerializedRule }
 *   { "cmd": "removeRule", "id": string, "pattern": string, "flags"?: string }
 *   { "cmd": "setRules", "id": string, "rules": SerializedRule[] }
 *   { "cmd": "getRules", "id": string }
 *   { "cmd": "clearRules", "id": string }
 *   { "cmd": "selectMenuOption", "id": string, "optionIndex": number }
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
 *   { "event": "rules", "id": string, "rules": SerializedRule[] }
 *   { "event": "ack", "cmd": string, "id"?: string, "success": boolean, "error"?: string }
 */

import * as readline from 'readline';
import { PTYManager } from './pty-manager';
import { ShellAdapter } from './adapters';
import type { SpawnConfig, SessionHandle, BlockingPromptInfo, SessionMessage, AutoResponseRule, BlockingPromptType, StallClassification } from './types';

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

/**
 * Serialized auto-response rule for IPC (pattern as string instead of RegExp)
 */
interface SerializedRule {
  pattern: string;
  flags?: string;
  type: BlockingPromptType;
  response: string;
  responseType?: 'text' | 'keys';
  keys?: string[];
  description: string;
  safe?: boolean;
  once?: boolean;
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
  // Auto-response rule commands
  rule?: SerializedRule;
  rules?: SerializedRule[];
  pattern?: string;
  flags?: string;
  // selectMenuOption command
  optionIndex?: number;
  // Stall detection commands
  enabled?: boolean;
  timeoutMs?: number;
  classification?: StallClassification | null;
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

manager.on('stall_detected', (handle: SessionHandle, recentOutput: string, stallDurationMs: number) => {
  emit({
    event: 'stall_detected',
    id: handle.id,
    recentOutput,
    stallDurationMs,
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
    // Use manager.send() which goes through session.send() → session.write()
    // This properly formats input via adapter and appends \r
    manager.send(id, data);
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

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Response Rule Commands
// ─────────────────────────────────────────────────────────────────────────────

function deserializeRule(serialized: SerializedRule): AutoResponseRule {
  return {
    pattern: new RegExp(serialized.pattern, serialized.flags || ''),
    type: serialized.type,
    response: serialized.response,
    responseType: serialized.responseType,
    keys: serialized.keys,
    description: serialized.description,
    safe: serialized.safe,
    once: serialized.once,
  };
}

function serializeRule(rule: AutoResponseRule): SerializedRule {
  return {
    pattern: rule.pattern.source,
    flags: rule.pattern.flags || undefined,
    type: rule.type,
    response: rule.response,
    responseType: rule.responseType,
    keys: rule.keys,
    description: rule.description,
    safe: rule.safe,
    once: rule.once,
  };
}

function handleAddRule(id: string, serializedRule: SerializedRule): void {
  try {
    const rule = deserializeRule(serializedRule);
    manager.addAutoResponseRule(id, rule);
    ack('addRule', id, true);
  } catch (err) {
    ack('addRule', id, false, err instanceof Error ? err.message : String(err));
  }
}

function handleRemoveRule(id: string, pattern: string, flags?: string): void {
  try {
    const regex = new RegExp(pattern, flags || '');
    const removed = manager.removeAutoResponseRule(id, regex);
    ack('removeRule', id, removed, removed ? undefined : 'Rule not found');
  } catch (err) {
    ack('removeRule', id, false, err instanceof Error ? err.message : String(err));
  }
}

function handleSetRules(id: string, serializedRules: SerializedRule[]): void {
  try {
    const rules = serializedRules.map(deserializeRule);
    manager.setAutoResponseRules(id, rules);
    ack('setRules', id, true);
  } catch (err) {
    ack('setRules', id, false, err instanceof Error ? err.message : String(err));
  }
}

function handleGetRules(id: string): void {
  try {
    const rules = manager.getAutoResponseRules(id);
    const serialized = rules.map(serializeRule);
    emit({ event: 'rules', id, rules: serialized });
  } catch (err) {
    emit({ event: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
}

function handleClearRules(id: string): void {
  try {
    manager.clearAutoResponseRules(id);
    ack('clearRules', id, true);
  } catch (err) {
    ack('clearRules', id, false, err instanceof Error ? err.message : String(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stall Detection Commands
// ─────────────────────────────────────────────────────────────────────────────

function handleConfigureStallDetection(enabled: boolean, timeoutMs?: number): void {
  try {
    manager.configureStallDetection(enabled, timeoutMs);
    ack('configureStallDetection', undefined, true);
  } catch (err) {
    ack('configureStallDetection', undefined, false, err instanceof Error ? err.message : String(err));
  }
}

function handleSelectMenuOption(id: string, optionIndex: number): void {
  const session = manager.getSession(id);
  if (!session) {
    ack('selectMenuOption', id, false, `Session ${id} not found`);
    return;
  }
  session.selectMenuOption(optionIndex)
    .then(() => ack('selectMenuOption', id, true))
    .catch(err => ack('selectMenuOption', id, false, err instanceof Error ? err.message : String(err)));
}

function handleClassifyStallResult(id: string, classification: StallClassification | null): void {
  try {
    const session = manager.getSession(id);
    if (!session) {
      ack('classifyStallResult', id, false, `Session ${id} not found`);
      return;
    }
    session.handleStallClassification(classification);
    ack('classifyStallResult', id, true);
  } catch (err) {
    ack('classifyStallResult', id, false, err instanceof Error ? err.message : String(err));
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

    case 'addRule':
      if (!command.id || !command.rule) {
        ack('addRule', command.id, false, 'Missing id or rule');
        return;
      }
      handleAddRule(command.id, command.rule);
      break;

    case 'removeRule':
      if (!command.id || !command.pattern) {
        ack('removeRule', command.id, false, 'Missing id or pattern');
        return;
      }
      handleRemoveRule(command.id, command.pattern, command.flags);
      break;

    case 'setRules':
      if (!command.id || !command.rules) {
        ack('setRules', command.id, false, 'Missing id or rules');
        return;
      }
      handleSetRules(command.id, command.rules);
      break;

    case 'getRules':
      if (!command.id) {
        ack('getRules', command.id, false, 'Missing id');
        return;
      }
      handleGetRules(command.id);
      break;

    case 'clearRules':
      if (!command.id) {
        ack('clearRules', command.id, false, 'Missing id');
        return;
      }
      handleClearRules(command.id);
      break;

    case 'selectMenuOption':
      if (!command.id || command.optionIndex === undefined) {
        ack('selectMenuOption', command.id, false, 'Missing id or optionIndex');
        return;
      }
      handleSelectMenuOption(command.id, command.optionIndex);
      break;

    case 'configureStallDetection':
      handleConfigureStallDetection(command.enabled ?? false, command.timeoutMs);
      break;

    case 'classifyStallResult':
      if (!command.id) {
        ack('classifyStallResult', command.id, false, 'Missing id');
        return;
      }
      handleClassifyStallResult(command.id, command.classification ?? null);
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
