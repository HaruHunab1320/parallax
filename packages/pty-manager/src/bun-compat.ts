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
import type { SpawnConfig } from './types';

export interface WorkerSessionHandle {
  id: string;
  name: string;
  type: string;
  status: 'starting' | 'ready' | 'stopped' | 'error';
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

  constructor(options: BunPTYManagerOptions = {}) {
    super();

    this.nodePath = options.nodePath || 'node';
    this.workerPath = options.workerPath || this.findWorkerPath();
    this.env = options.env || {};

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
  return typeof process !== 'undefined' && 'Bun' in process.versions;
}

/**
 * Create the appropriate PTY manager based on runtime
 */
export function createPTYManager(options?: BunPTYManagerOptions): BunCompatiblePTYManager {
  return new BunCompatiblePTYManager(options);
}
