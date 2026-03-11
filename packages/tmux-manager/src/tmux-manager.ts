/**
 * Tmux Manager
 *
 * Manages multiple tmux sessions for CLI tools.
 * Mirrors PTYManager's API but uses tmux as the transport layer.
 */

import { EventEmitter } from 'events';
import type { CLIAdapter } from './adapters/adapter-interface.js';
import { AdapterRegistry } from './adapters/adapter-registry.js';
import { TmuxSession } from './tmux-session.js';
import { TmuxTransport } from './tmux-transport.js';
import { consoleLogger } from './logger.js';
import type {
  SpawnConfig,
  SessionHandle,
  SessionMessage,
  SessionFilter,
  SessionStatus,
  BlockingPromptInfo,
  AuthRequiredInfo,
  AutoResponseRule,
  StallClassification,
  ToolRunningInfo,
  StopOptions,
  LogOptions,
  TerminalAttachment,
  TmuxManagerConfig,
  Logger,
} from './types.js';

export interface TmuxManagerEvents {
  session_started: (session: SessionHandle) => void;
  session_ready: (session: SessionHandle) => void;
  session_stopped: (session: SessionHandle, reason: string) => void;
  session_error: (session: SessionHandle, error: string) => void;
  login_required: (session: SessionHandle, instructions?: string, url?: string) => void;
  auth_required: (session: SessionHandle, info: AuthRequiredInfo) => void;
  blocking_prompt: (session: SessionHandle, promptInfo: BlockingPromptInfo, autoResponded: boolean) => void;
  message: (message: SessionMessage) => void;
  question: (session: SessionHandle, question: string) => void;
  stall_detected: (session: SessionHandle, recentOutput: string, stallDurationMs: number) => void;
  session_status_changed: (session: SessionHandle) => void;
  task_complete: (session: SessionHandle) => void;
  tool_running: (session: SessionHandle, info: ToolRunningInfo) => void;
}

export class TmuxManager extends EventEmitter {
  private sessions: Map<string, TmuxSession> = new Map();
  private outputLogs: Map<string, string[]> = new Map();
  private maxLogLines: number;
  private logger: Logger;
  private transport: TmuxTransport;
  public readonly adapters: AdapterRegistry;

  // Stall detection config
  private _stallDetectionEnabled: boolean;
  private _stallTimeoutMs: number;
  private _onStallClassify?: (
    sessionId: string,
    recentOutput: string,
    stallDurationMs: number
  ) => Promise<StallClassification | null>;

  // Tmux-specific config
  private _historyLimit: number;
  private _sessionPrefix: string;

  constructor(config: TmuxManagerConfig = {}) {
    super();
    this.adapters = new AdapterRegistry();
    this.logger = config.logger || consoleLogger;
    this.maxLogLines = config.maxLogLines || 1000;
    this._stallDetectionEnabled = config.stallDetectionEnabled ?? false;
    this._stallTimeoutMs = config.stallTimeoutMs ?? 8000;
    this._onStallClassify = config.onStallClassify;
    this._historyLimit = config.historyLimit ?? 50000;
    this._sessionPrefix = config.sessionPrefix ?? 'parallax';
    this.transport = new TmuxTransport();
  }

  /**
   * Register a CLI adapter
   */
  registerAdapter(adapter: CLIAdapter): void {
    this.adapters.register(adapter);
  }

  /**
   * Spawn a new tmux session
   */
  async spawn(config: SpawnConfig): Promise<SessionHandle> {
    const adapter = this.adapters.get(config.type);
    if (!adapter) {
      throw new Error(
        `No adapter found for type: ${config.type}. Registered adapters: ${this.adapters.list().join(', ') || 'none'}`
      );
    }

    if (config.id && this.sessions.has(config.id)) {
      throw new Error(`Session with ID ${config.id} already exists`);
    }

    this.logger.info(
      { type: config.type, name: config.name },
      'Spawning tmux session'
    );

    const session = new TmuxSession(
      adapter,
      config,
      this.logger,
      this._stallDetectionEnabled,
      this._stallTimeoutMs,
      this.transport,
      this._sessionPrefix,
      this._historyLimit,
    );

    this.setupSessionEvents(session);
    this.sessions.set(session.id, session);
    this.outputLogs.set(session.id, []);

    await session.start();

    const handle = session.toHandle();
    this.emit('session_started', handle);

    return handle;
  }

  /**
   * Set up event handlers for a session
   */
  private setupSessionEvents(session: TmuxSession): void {
    session.on('output', (data: string) => {
      const logs = this.outputLogs.get(session.id) || [];
      const lines = data.split('\n');
      logs.push(...lines);

      while (logs.length > this.maxLogLines) {
        logs.shift();
      }
      this.outputLogs.set(session.id, logs);
    });

    session.on('ready', () => {
      this.emit('session_ready', session.toHandle());
    });

    session.on('login_required', (instructions?: string, url?: string) => {
      this.emit('login_required', session.toHandle(), instructions, url);
    });

    session.on('auth_required', (info: AuthRequiredInfo) => {
      this.emit('auth_required', session.toHandle(), info);
    });

    session.on('blocking_prompt', (promptInfo: BlockingPromptInfo, autoResponded: boolean) => {
      this.emit('blocking_prompt', session.toHandle(), promptInfo, autoResponded);
    });

    session.on('message', (message: SessionMessage) => {
      this.emit('message', message);
    });

    session.on('question', (question: string) => {
      this.emit('question', session.toHandle(), question);
    });

    session.on('exit', (code: number) => {
      const reason = code === 0 ? 'normal exit' : `exit code ${code}`;
      this.emit('session_stopped', session.toHandle(), reason);
    });

    session.on('error', (error: Error) => {
      this.emit('session_error', session.toHandle(), error.message);
    });

    session.on('status_changed', () => {
      this.emit('session_status_changed', session.toHandle());
    });

    session.on('task_complete', () => {
      this.emit('task_complete', session.toHandle());
    });

    session.on('tool_running', (info: ToolRunningInfo) => {
      this.emit('tool_running', session.toHandle(), info);
    });

    session.on('stall_detected', (recentOutput: string, stallDurationMs: number) => {
      const handle = session.toHandle();
      this.emit('stall_detected', handle, recentOutput, stallDurationMs);

      if (this._onStallClassify) {
        const sanitized = recentOutput
          .slice(-1500)
          .replace(/\b(ignore|disregard|forget)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)\b/gi, '[REDACTED]')
          .replace(/\b(you\s+are|act\s+as|pretend\s+to\s+be|you\s+must|system\s*:)\b/gi, '[REDACTED]');
        this._onStallClassify(session.id, sanitized, stallDurationMs)
          .then((classification) => {
            session.handleStallClassification(classification);
          })
          .catch((err) => {
            this.logger.error(
              { sessionId: session.id, error: err },
              'Stall classification callback failed'
            );
            session.handleStallClassification(null);
          });
      }
    });
  }

  /**
   * Stop a session
   */
  async stop(sessionId: string, options?: StopOptions): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.logger.info({ sessionId, force: options?.force }, 'Stopping session');

    const timeout = options?.timeout || 5000;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        session.kill('SIGKILL');
        // Give SIGKILL a moment then clean up
        setTimeout(() => {
          session.removeAllListeners();
          this.sessions.delete(sessionId);
          this.outputLogs.delete(sessionId);
          resolve();
        }, 500);
      }, timeout);

      session.once('exit', () => {
        clearTimeout(timer);
        session.removeAllListeners();
        this.sessions.delete(sessionId);
        this.outputLogs.delete(sessionId);
        resolve();
      });

      session.kill(options?.force ? 'SIGKILL' : 'SIGTERM');
    });
  }

  /**
   * Stop all sessions
   */
  async stopAll(options?: StopOptions): Promise<void> {
    const stopPromises = Array.from(this.sessions.keys()).map((id) =>
      this.stop(id, options).catch((err) => {
        this.logger.warn({ sessionId: id, error: err }, 'Error stopping session');
      })
    );

    await Promise.all(stopPromises);
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): SessionHandle | null {
    const session = this.sessions.get(sessionId);
    return session ? session.toHandle() : null;
  }

  /**
   * List all sessions
   */
  list(filter?: SessionFilter): SessionHandle[] {
    const handles: SessionHandle[] = [];

    for (const session of this.sessions.values()) {
      const handle = session.toHandle();

      if (filter) {
        if (filter.status) {
          const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
          if (!statuses.includes(handle.status)) continue;
        }

        if (filter.type) {
          const types = Array.isArray(filter.type) ? filter.type : [filter.type];
          if (!types.includes(handle.type)) continue;
        }
      }

      handles.push(handle);
    }

    return handles;
  }

  /**
   * Send a message to a session
   */
  send(sessionId: string, message: string): SessionMessage {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return session.send(message);
  }

  /**
   * Get logs for a session
   */
  async *logs(sessionId: string, options?: LogOptions): AsyncIterable<string> {
    const logBuffer = this.outputLogs.get(sessionId);
    if (!logBuffer) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const lines = options?.tail
      ? logBuffer.slice(-options.tail)
      : logBuffer;

    for (const line of lines) {
      yield line;
    }
  }

  /**
   * Get metrics for a session
   */
  metrics(sessionId: string): { uptime?: number; messageCount?: number } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const handle = session.toHandle();
    const uptime = handle.startedAt
      ? Math.floor((Date.now() - handle.startedAt.getTime()) / 1000)
      : undefined;

    return { uptime };
  }

  /**
   * Shutdown manager and stop all sessions
   */
  async shutdown(): Promise<void> {
    this.logger.info({ count: this.sessions.size }, 'Shutting down all tmux sessions');

    await this.stopAll({ timeout: 3000 });

    this.sessions.clear();
    this.outputLogs.clear();
    this.transport.destroy();
  }

  /**
   * Get count of sessions by status
   */
  getStatusCounts(): Record<SessionStatus, number> {
    const counts: Record<SessionStatus, number> = {
      pending: 0,
      starting: 0,
      authenticating: 0,
      ready: 0,
      busy: 0,
      stopping: 0,
      stopped: 0,
      error: 0,
    };

    for (const session of this.sessions.values()) {
      counts[session.status]++;
    }

    return counts;
  }

  /**
   * Attach to a session's terminal for raw I/O streaming
   */
  attachTerminal(sessionId: string): TerminalAttachment | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      onData: (callback: (data: string) => void) => {
        session.on('output', callback);
        return () => session.off('output', callback);
      },
      write: (data: string) => {
        session.writeRaw(data);
      },
      resize: (cols: number, rows: number) => {
        session.resize(cols, rows);
      },
    };
  }

  /**
   * Check if a session exists
   */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get the underlying TmuxSession (for advanced use)
   */
  getSession(sessionId: string): TmuxSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tmux-Specific Features
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * List orphaned tmux sessions from previous runs.
   * These are tmux sessions with the configured prefix that aren't tracked by this manager.
   */
  listOrphanedSessions(): Array<{ name: string; created: string; attached: boolean }> {
    const tmuxSessions = TmuxTransport.listSessions(this._sessionPrefix);
    const managedNames = new Set(
      Array.from(this.sessions.values()).map(s => s.tmuxName)
    );

    return tmuxSessions.filter(s => !managedNames.has(s.name));
  }

  /**
   * Clean up orphaned tmux sessions from previous runs.
   */
  cleanupOrphanedSessions(): number {
    const orphans = this.listOrphanedSessions();
    for (const orphan of orphans) {
      try {
        this.transport.kill(orphan.name);
        this.logger.info({ tmuxSession: orphan.name }, 'Cleaned up orphaned tmux session');
      } catch {
        this.logger.warn({ tmuxSession: orphan.name }, 'Failed to clean up orphaned tmux session');
      }
    }
    return orphans.length;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Stall Detection Configuration
  // ─────────────────────────────────────────────────────────────────────────────

  configureStallDetection(
    enabled: boolean,
    timeoutMs?: number,
    classify?: (sessionId: string, recentOutput: string, stallDurationMs: number) => Promise<StallClassification | null>,
  ): void {
    this._stallDetectionEnabled = enabled;
    if (timeoutMs !== undefined) {
      this._stallTimeoutMs = timeoutMs;
    }
    if (classify !== undefined) {
      this._onStallClassify = classify;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Runtime Auto-Response Rules API
  // ─────────────────────────────────────────────────────────────────────────────

  addAutoResponseRule(sessionId: string, rule: AutoResponseRule): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.addAutoResponseRule(rule);
  }

  removeAutoResponseRule(sessionId: string, pattern: RegExp): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session.removeAutoResponseRule(pattern);
  }

  setAutoResponseRules(sessionId: string, rules: AutoResponseRule[]): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.setAutoResponseRules(rules);
  }

  getAutoResponseRules(sessionId: string): AutoResponseRule[] {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session.getAutoResponseRules();
  }

  clearAutoResponseRules(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.clearAutoResponseRules();
  }
}
