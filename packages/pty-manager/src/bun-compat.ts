/**
 * Bun-Compatible PTY Manager
 *
 * A wrapper that spawns a Node.js worker process to handle PTY operations,
 * allowing pty-manager to work from Bun or other non-Node runtimes.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as readline from 'readline';
import type { SpawnConfig, AutoResponseRule, BlockingPromptType, SessionStatus, StallClassification } from './types';

/**
 * Serialized auto-response rule for IPC (pattern as string instead of RegExp)
 */
export interface SerializedRule {
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

export interface WorkerSessionHandle {
  id: string;
  name: string;
  type: string;
  status: SessionStatus;
  pid: number | undefined;
  cols: number;
  rows: number;
  startedAt?: Date;
  lastActivityAt?: Date;
  error?: string;
  exitCode?: number;
}

export interface BunPTYManagerOptions {
  /** Path to node executable (default: 'node') */
  nodePath?: string;
  /** Path to worker script (default: auto-detected) */
  workerPath?: string;
  /** Environment variables for worker process */
  env?: Record<string, string>;
  /**
   * Adapter modules to load in the worker process.
   * Each module should export a `createAllAdapters()` function that returns an array of adapters.
   * Example: ['coding-agent-adapters']
   */
  adapterModules?: string[];

  /** Enable stall detection (default: false) */
  stallDetectionEnabled?: boolean;
  /** Default stall timeout in ms (default: 8000) */
  stallTimeoutMs?: number;
  /**
   * External classification callback invoked when a stall is detected.
   * The worker emits stall_detected; this callback runs on the parent side.
   */
  onStallClassify?: (
    sessionId: string,
    recentOutput: string,
    stallDurationMs: number,
  ) => Promise<StallClassification | null>;
}

interface PendingOperation {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * PTY Manager that works with Bun and other non-Node runtimes
 * by spawning a Node.js worker process.
 */
export class BunCompatiblePTYManager extends EventEmitter {
  private worker: ChildProcess | null = null;
  private sessions: Map<string, WorkerSessionHandle> = new Map();
  private pending: Map<string, PendingOperation> = new Map();
  private ready = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private nodePath: string;
  private workerPath: string;
  private env: Record<string, string>;
  private adapterModules: string[];
  private _stallDetectionEnabled: boolean;
  private _stallTimeoutMs: number;
  private _onStallClassify?: (
    sessionId: string,
    recentOutput: string,
    stallDurationMs: number,
  ) => Promise<StallClassification | null>;

  constructor(options: BunPTYManagerOptions = {}) {
    super();

    this.nodePath = options.nodePath || 'node';
    this.workerPath = options.workerPath || this.findWorkerPath();
    this.env = options.env || {};
    this.adapterModules = options.adapterModules || [];
    this._stallDetectionEnabled = options.stallDetectionEnabled ?? false;
    this._stallTimeoutMs = options.stallTimeoutMs ?? 8000;
    this._onStallClassify = options.onStallClassify;

    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    this.startWorker();
  }

  private findWorkerPath(): string {
    // Try to find the worker script relative to this module
    const possiblePaths = [
      path.join(__dirname, 'pty-worker.js'),
      path.join(__dirname, '..', 'dist', 'pty-worker.js'),
      path.join(__dirname, '..', 'src', 'pty-worker.js'),
    ];

    // Return first path (we'll rely on Node to throw if it doesn't exist)
    return possiblePaths[0];
  }

  private startWorker(): void {
    this.worker = spawn(this.nodePath, [this.workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    });

    if (!this.worker.stdout || !this.worker.stdin) {
      throw new Error('Failed to create worker process pipes');
    }

    const rl = readline.createInterface({
      input: this.worker.stdout,
      terminal: false,
    });

    rl.on('line', (line) => this.handleWorkerMessage(line));

    this.worker.stderr?.on('data', (data) => {
      this.emit('worker_error', data.toString());
    });

    this.worker.on('exit', (code, signal) => {
      this.ready = false;
      this.worker = null;
      this.emit('worker_exit', { code, signal });

      // Reject all pending operations
      for (const [key, op] of this.pending) {
        clearTimeout(op.timeout);
        op.reject(new Error('Worker process exited'));
        this.pending.delete(key);
      }

      // Mark all sessions as stopped
      for (const session of this.sessions.values()) {
        session.status = 'stopped';
      }
    });

    this.worker.on('error', (err) => {
      this.emit('worker_error', err);
    });
  }

  private handleWorkerMessage(line: string): void {
    let event: Record<string, unknown>;

    try {
      event = JSON.parse(line);
    } catch {
      this.emit('worker_error', `Invalid JSON from worker: ${line}`);
      return;
    }

    const eventType = event.event as string;
    const id = event.id as string | undefined;

    switch (eventType) {
      case 'worker_ready':
        // Register adapter modules before marking as ready
        if (this.adapterModules.length > 0) {
          this.sendCommand({ cmd: 'registerAdapters', modules: this.adapterModules });
        }
        // Send stall detection config to worker
        if (this._stallDetectionEnabled) {
          this.sendCommand({
            cmd: 'configureStallDetection',
            enabled: true,
            timeoutMs: this._stallTimeoutMs,
          });
        }
        this.ready = true;
        this.readyResolve();
        this.emit('ready');
        break;

      case 'spawned': {
        // Get config from event (worker sends it back)
        const session: WorkerSessionHandle = {
          id: id!,
          name: (event.name as string) || id!,
          type: (event.type as string) || 'shell',
          status: 'starting',
          pid: event.pid as number,
          cols: (event.cols as number) || 80,
          rows: (event.rows as number) || 24,
          startedAt: new Date(),
        };
        this.sessions.set(id!, session);
        this.emit('session_started', session);
        break;
      }

      case 'output': {
        const session = this.sessions.get(id!);
        if (session) {
          session.lastActivityAt = new Date();
        }
        this.emit('data', { id, data: event.data });
        this.emit(`data:${id}`, event.data);
        break;
      }

      case 'ready': {
        const session = this.sessions.get(id!);
        if (session) {
          session.status = 'ready';
          session.lastActivityAt = new Date();
          this.emit('session_ready', session);
        }
        break;
      }

      case 'exit': {
        const session = this.sessions.get(id!);
        if (session) {
          session.status = 'stopped';
          session.exitCode = event.code as number;
          session.lastActivityAt = new Date();
          this.emit('session_stopped', session, event.code, event.signal);
          this.sessions.delete(id!);
        }
        break;
      }

      case 'error':
        if (id) {
          const session = this.sessions.get(id);
          if (session) {
            session.status = 'error';
            session.error = event.message as string;
            session.lastActivityAt = new Date();
          }
          this.emit('session_error', { id, error: event.message });
        } else {
          this.emit('worker_error', event.message);
        }
        break;

      case 'blocking_prompt': {
        const session = this.sessions.get(id!);
        if (session) {
          this.emit('blocking_prompt', session, event.promptInfo, event.autoResponded);
        }
        break;
      }

      case 'login_required': {
        const session = this.sessions.get(id!);
        if (session) {
          session.status = 'authenticating';
          this.emit('login_required', session, event.instructions, event.url);
        }
        break;
      }

      case 'message': {
        const msg = event.message as Record<string, unknown>;
        // Convert timestamp back to Date
        this.emit('message', {
          ...msg,
          timestamp: new Date(msg.timestamp as string),
        });
        break;
      }

      case 'question': {
        const session = this.sessions.get(id!);
        if (session) {
          this.emit('question', session, event.question);
        }
        break;
      }

      case 'stall_detected': {
        const session = this.sessions.get(id!);
        if (session) {
          const recentOutput = event.recentOutput as string;
          const stallDurationMs = event.stallDurationMs as number;
          this.emit('stall_detected', session, recentOutput, stallDurationMs);

          // Call external classifier on parent side, send result back to worker
          if (this._onStallClassify) {
            this._onStallClassify(id!, recentOutput, stallDurationMs)
              .then((classification) => {
                this.sendCommand({
                  cmd: 'classifyStallResult',
                  id: id!,
                  classification,
                });
              })
              .catch(() => {
                // On error, send null to reset the timer
                this.sendCommand({
                  cmd: 'classifyStallResult',
                  id: id!,
                  classification: null,
                });
              });
          }
        }
        break;
      }

      case 'list': {
        // Convert date strings back to Date objects
        const sessions = (event.sessions as Record<string, unknown>[]).map((s) => ({
          ...s,
          startedAt: s.startedAt ? new Date(s.startedAt as string) : undefined,
          lastActivityAt: s.lastActivityAt ? new Date(s.lastActivityAt as string) : undefined,
        })) as WorkerSessionHandle[];
        this.resolvePending('list', sessions);
        break;
      }

      case 'rules': {
        // Convert serialized rules back to AutoResponseRule objects
        const serializedRules = event.rules as SerializedRule[];
        const rules = serializedRules.map((r) => ({
          pattern: new RegExp(r.pattern, r.flags || ''),
          type: r.type,
          response: r.response,
          responseType: r.responseType,
          keys: r.keys,
          description: r.description,
          safe: r.safe,
          once: r.once,
        })) as AutoResponseRule[];
        this.resolvePending(`getRules:${id}`, rules);
        break;
      }

      case 'ack': {
        const cmd = event.cmd as string;
        const success = event.success as boolean;
        const pendingKey = id ? `${cmd}:${id}` : cmd;
        const pending = this.pending.get(pendingKey);

        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(pendingKey);

          if (success) {
            pending.resolve(true);
          } else {
            pending.reject(new Error(event.error as string));
          }
        }
        break;
      }
    }
  }

  private sendCommand(cmd: Record<string, unknown>): void {
    if (!this.worker?.stdin) {
      throw new Error('Worker not available');
    }

    this.worker.stdin.write(JSON.stringify(cmd) + '\n');
  }

  private createPending(key: string, timeoutMs = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`Operation ${key} timed out`));
      }, timeoutMs);

      this.pending.set(key, { resolve, reject, timeout });
    });
  }

  private resolvePending(key: string, value: unknown): void {
    const pending = this.pending.get(key);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(key);
      pending.resolve(value);
    }
  }

  /**
   * Wait for the worker to be ready
   */
  async waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Check if worker is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Spawn a new PTY session
   */
  async spawn(config: SpawnConfig & { id: string }): Promise<WorkerSessionHandle> {
    await this.waitForReady();

    const { id } = config;

    this.sendCommand({ cmd: 'spawn', id, config });

    await this.createPending(`spawn:${id}`);

    return this.sessions.get(id)!;
  }

  /**
   * Send data to a session
   */
  async send(id: string, data: string): Promise<void> {
    await this.waitForReady();

    this.sendCommand({ cmd: 'send', id, data });

    await this.createPending(`send:${id}`);
  }

  /**
   * Send special keys to a session
   */
  async sendKeys(id: string, keys: string | string[]): Promise<void> {
    await this.waitForReady();

    this.sendCommand({ cmd: 'sendKeys', id, keys });

    await this.createPending(`sendKeys:${id}`);
  }

  /**
   * Paste text to a session
   */
  async paste(id: string, text: string, bracketed = true): Promise<void> {
    await this.waitForReady();

    this.sendCommand({ cmd: 'paste', id, text, bracketed });

    await this.createPending(`paste:${id}`);
  }

  /**
   * Resize a session
   */
  async resize(id: string, cols: number, rows: number): Promise<void> {
    await this.waitForReady();

    this.sendCommand({ cmd: 'resize', id, cols, rows });

    const session = this.sessions.get(id);
    if (session) {
      session.cols = cols;
      session.rows = rows;
    }

    await this.createPending(`resize:${id}`);
  }

  /**
   * Kill a session
   */
  async kill(id: string, signal?: string): Promise<void> {
    await this.waitForReady();

    this.sendCommand({ cmd: 'kill', id, signal });

    await this.createPending(`kill:${id}`);
  }

  /**
   * Get a session by ID
   */
  get(id: string): WorkerSessionHandle | undefined {
    return this.sessions.get(id);
  }

  /**
   * List all sessions
   */
  async list(): Promise<WorkerSessionHandle[]> {
    await this.waitForReady();

    this.sendCommand({ cmd: 'list' });

    const sessions = (await this.createPending('list')) as WorkerSessionHandle[];
    return sessions;
  }

  /**
   * Check if a session exists
   */
  has(id: string): boolean {
    return this.sessions.has(id);
  }

  /**
   * Subscribe to output from a specific session
   */
  onSessionData(id: string, callback: (data: string) => void): () => void {
    const handler = (data: string) => callback(data);
    this.on(`data:${id}`, handler);
    return () => this.off(`data:${id}`, handler);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Runtime Auto-Response Rules API
  // ─────────────────────────────────────────────────────────────────────────────

  private serializeRule(rule: AutoResponseRule): SerializedRule {
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

  /**
   * Add an auto-response rule to a session.
   * Session rules are checked before adapter rules.
   */
  async addAutoResponseRule(sessionId: string, rule: AutoResponseRule): Promise<void> {
    await this.waitForReady();

    const serialized = this.serializeRule(rule);
    this.sendCommand({ cmd: 'addRule', id: sessionId, rule: serialized });

    await this.createPending(`addRule:${sessionId}`);
  }

  /**
   * Remove an auto-response rule from a session by pattern.
   * Returns true if a rule was removed.
   */
  async removeAutoResponseRule(sessionId: string, pattern: RegExp): Promise<boolean> {
    await this.waitForReady();

    this.sendCommand({
      cmd: 'removeRule',
      id: sessionId,
      pattern: pattern.source,
      flags: pattern.flags || undefined,
    });

    try {
      await this.createPending(`removeRule:${sessionId}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set all auto-response rules for a session, replacing existing ones.
   */
  async setAutoResponseRules(sessionId: string, rules: AutoResponseRule[]): Promise<void> {
    await this.waitForReady();

    const serialized = rules.map((r) => this.serializeRule(r));
    this.sendCommand({ cmd: 'setRules', id: sessionId, rules: serialized });

    await this.createPending(`setRules:${sessionId}`);
  }

  /**
   * Get all auto-response rules for a session.
   */
  async getAutoResponseRules(sessionId: string): Promise<AutoResponseRule[]> {
    await this.waitForReady();

    this.sendCommand({ cmd: 'getRules', id: sessionId });

    const rules = (await this.createPending(`getRules:${sessionId}`)) as AutoResponseRule[];
    return rules;
  }

  /**
   * Select a TUI menu option by index (0-based) in a session.
   */
  async selectMenuOption(id: string, optionIndex: number): Promise<void> {
    await this.waitForReady();

    this.sendCommand({ cmd: 'selectMenuOption', id, optionIndex });

    await this.createPending(`selectMenuOption:${id}`);
  }

  /**
   * Clear all auto-response rules for a session.
   */
  async clearAutoResponseRules(sessionId: string): Promise<void> {
    await this.waitForReady();

    this.sendCommand({ cmd: 'clearRules', id: sessionId });

    await this.createPending(`clearRules:${sessionId}`);
  }

  /**
   * Shutdown the worker and all sessions
   */
  async shutdown(): Promise<void> {
    if (!this.worker) return;

    this.sendCommand({ cmd: 'shutdown' });

    await this.createPending('shutdown', 10000).catch(() => {
      // Force kill if shutdown times out
      this.worker?.kill('SIGKILL');
    });
  }

  /**
   * Restart the worker process
   */
  async restart(): Promise<void> {
    await this.shutdown();

    this.sessions.clear();
    this.ready = false;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    this.startWorker();
    await this.waitForReady();
  }
}

/**
 * Detect if running in Bun
 */
export function isBun(): boolean {
  // Bun 1.1.24+ sets process.versions.bun (lowercase)
  return typeof process !== 'undefined' && 'bun' in process.versions;
}

/**
 * Create the appropriate PTY manager based on runtime
 */
export function createPTYManager(options?: BunPTYManagerOptions): BunCompatiblePTYManager {
  return new BunCompatiblePTYManager(options);
}
