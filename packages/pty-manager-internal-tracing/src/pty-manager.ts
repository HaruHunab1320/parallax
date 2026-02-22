/**
 * PTY Manager
 *
 * Manages multiple PTY sessions for CLI tools.
 */

import { EventEmitter } from 'events';
import { PTYStateCaptureManager, type SessionCaptureSnapshot } from 'pty-state-capture';
import type { CLIAdapter } from './adapters/adapter-interface';
import { AdapterRegistry } from './adapters/adapter-registry';
import { PTYSession } from './pty-session';
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
  StopOptions,
  LogOptions,
  TerminalAttachment,
  PTYManagerConfig,
  Logger,
  InteractionStateChangedInfo,
  PTYCaptureConfig,
} from './types';

export interface PTYManagerEvents {
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
  interaction_state_changed: (session: SessionHandle, info: InteractionStateChangedInfo) => void;
}

/**
 * Console-based logger fallback
 */
const consoleLogger: Logger = {
  debug: (...args: unknown[]) => {
    if (typeof args[0] === 'string') {
      console.debug(args[0], args[1]);
    } else {
      console.debug(args[1], args[0]);
    }
  },
  info: (...args: unknown[]) => {
    if (typeof args[0] === 'string') {
      console.info(args[0], args[1]);
    } else {
      console.info(args[1], args[0]);
    }
  },
  warn: (...args: unknown[]) => {
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

export class PTYManager extends EventEmitter {
  private sessions: Map<string, PTYSession> = new Map();
  private outputLogs: Map<string, string[]> = new Map();
  private maxLogLines: number;
  private logger: Logger;
  public readonly adapters: AdapterRegistry;

  // Stall detection config
  private _stallDetectionEnabled: boolean;
  private _stallTimeoutMs: number;
  private _onStallClassify?: (
    sessionId: string,
    recentOutput: string,
    stallDurationMs: number
  ) => Promise<StallClassification | null>;
  private captureManager: PTYStateCaptureManager | null = null;
  private captureEnabled = false;
  private captureConfig: PTYCaptureConfig | null = null;

  constructor(config: PTYManagerConfig = {}) {
    super();
    this.adapters = new AdapterRegistry();
    this.logger = config.logger || consoleLogger;
    this.maxLogLines = config.maxLogLines || 1000;
    this._stallDetectionEnabled = config.stallDetectionEnabled ?? false;
    this._stallTimeoutMs = config.stallTimeoutMs ?? 8000;
    this._onStallClassify = config.onStallClassify;
    this.captureEnabled = config.capture?.enabled ?? false;
    this.captureConfig = config.capture ?? null;
    if (this.captureEnabled && config.capture) {
      this.captureManager = new PTYStateCaptureManager({
        outputRootDir: config.capture.outputRootDir,
        defaultRows: config.capture.rows,
        defaultCols: config.capture.cols,
        maxLines: config.capture.maxLines,
        maxNormalizedBufferChars: config.capture.maxNormalizedBufferChars,
      });
    }
  }

  /**
   * Register a CLI adapter
   */
  registerAdapter(adapter: CLIAdapter): void {
    this.adapters.register(adapter);
  }

  /**
   * Spawn a new PTY session
   */
  async spawn(config: SpawnConfig): Promise<SessionHandle> {
    // Get adapter for this type
    const adapter = this.adapters.get(config.type);
    if (!adapter) {
      throw new Error(`No adapter found for type: ${config.type}. Registered adapters: ${this.adapters.list().join(', ') || 'none'}`);
    }

    // Check if ID already exists
    if (config.id && this.sessions.has(config.id)) {
      throw new Error(`Session with ID ${config.id} already exists`);
    }

    this.logger.info(
      { type: config.type, name: config.name },
      'Spawning session'
    );

    // Create session
    const session = new PTYSession(
      adapter,
      config,
      this.logger,
      this._stallDetectionEnabled,
      this._stallTimeoutMs,
    );

    // Set up event forwarding
    this.setupSessionEvents(session);

    // Store session
    this.sessions.set(session.id, session);
    this.outputLogs.set(session.id, []);

    if (this.captureEnabled && this.captureManager) {
      await this.captureManager.openSession(session.id, {
        rows: config.rows ?? this.captureConfig?.rows,
        cols: config.cols ?? this.captureConfig?.cols,
        maxLines: this.captureConfig?.maxLines,
        maxNormalizedBufferChars: this.captureConfig?.maxNormalizedBufferChars,
        writeRawEvents: this.captureConfig?.writeRawEvents,
        writeStates: this.captureConfig?.writeStates,
        writeTransitions: this.captureConfig?.writeTransitions,
        writeLifecycle: this.captureConfig?.writeLifecycle,
      });
    }

    // Start the session
    await session.start();

    const handle = session.toHandle();
    this.emit('session_started', handle);

    return handle;
  }

  /**
   * Set up event handlers for a session
   */
  private setupSessionEvents(session: PTYSession): void {
    session.on('output', (data: string) => {
      // Store in log buffer
      const logs = this.outputLogs.get(session.id) || [];
      const lines = data.split('\n');
      logs.push(...lines);

      // Trim to max lines
      while (logs.length > this.maxLogLines) {
        logs.shift();
      }
      this.outputLogs.set(session.id, logs);

      void this.feedCapture(session, data, 'stdout');
    });

    session.on('input', (data: string) => {
      void this.feedCapture(session, data, 'stdin');
    });

    session.on('ready', () => {
      void this.captureManager?.lifecycle(session.id, 'session_ready');
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
      void this.captureManager?.lifecycle(session.id, 'session_stopped', reason);
      this.emit('session_stopped', session.toHandle(), reason);
    });

    session.on('error', (error: Error) => {
      void this.captureManager?.lifecycle(session.id, 'session_error', error.message);
      this.emit('session_error', session.toHandle(), error.message);
    });

    session.on('status_changed', () => {
      // Refresh the handle so the parent sees the updated status
      this.emit('session_status_changed', session.toHandle());
    });

    session.on('task_complete', () => {
      this.emit('task_complete', session.toHandle());
    });

    session.on('stall_detected', (recentOutput: string, stallDurationMs: number) => {
      const handle = session.toHandle();
      this.emit('stall_detected', handle, recentOutput, stallDurationMs);

      // Call external classifier if configured
      if (this._onStallClassify) {
        // Sanitize output before passing to LLM classifier to mitigate prompt injection.
        // Truncate to 1500 chars and strip sequences that could be used to manipulate the classifier.
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
            // Reset timer so detection continues
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
        // Force kill if graceful shutdown times out
        session.kill('SIGKILL');
        resolve();
      }, timeout);

      session.once('exit', () => {
        clearTimeout(timer);
        session.removeAllListeners();
        this.sessions.delete(sessionId);
        this.outputLogs.delete(sessionId);
        resolve();
      });

      // Send graceful signal
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

      // Apply filters
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
    if (!session) {
      return null;
    }

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
    this.logger.info({ count: this.sessions.size }, 'Shutting down all sessions');

    await this.stopAll({ timeout: 3000 });

    this.sessions.clear();
    this.outputLogs.clear();
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
    if (!session) {
      return null;
    }

    return {
      /**
       * Subscribe to raw terminal output
       * Returns an unsubscribe function
       */
      onData: (callback: (data: string) => void) => {
        session.on('output', callback);
        return () => session.off('output', callback);
      },

      /**
       * Write raw data to terminal (no formatting applied)
       */
      write: (data: string) => {
        session.writeRaw(data);
      },

      /**
       * Resize the terminal
       */
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
   * Get the underlying PTYSession (for advanced use)
   */
  getSession(sessionId: string): PTYSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Stall Detection Configuration
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Configure stall detection at runtime.
   * Affects newly spawned sessions only — existing sessions keep their config.
   */
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

  /**
   * Add an auto-response rule to a session.
   * Session rules are checked before adapter rules.
   */
  addAutoResponseRule(sessionId: string, rule: AutoResponseRule): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.addAutoResponseRule(rule);
  }

  /**
   * Remove an auto-response rule from a session by pattern.
   * Returns true if a rule was removed.
   */
  removeAutoResponseRule(sessionId: string, pattern: RegExp): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session.removeAutoResponseRule(pattern);
  }

  /**
   * Set all auto-response rules for a session, replacing existing ones.
   */
  setAutoResponseRules(sessionId: string, rules: AutoResponseRule[]): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.setAutoResponseRules(rules);
  }

  /**
   * Get all auto-response rules for a session.
   */
  getAutoResponseRules(sessionId: string): AutoResponseRule[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session.getAutoResponseRules();
  }

  /**
   * Clear all auto-response rules for a session.
   */
  clearAutoResponseRules(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.clearAutoResponseRules();
  }

  /**
   * Return latest capture snapshot for a session, if capture is enabled.
   */
  getCaptureSnapshot(sessionId: string): SessionCaptureSnapshot | null {
    return this.captureManager?.snapshot(sessionId) ?? null;
  }

  private async feedCapture(
    session: PTYSession,
    data: string,
    direction: 'stdout' | 'stderr' | 'stdin',
  ): Promise<void> {
    if (!this.captureEnabled || !this.captureManager) return;
    try {
      const result = await this.captureManager.feed(session.id, data, direction);
      if (!result.stateChanged) return;
      const info: InteractionStateChangedInfo = {
        sessionId: session.id,
        state: result.state.state,
        ruleId: result.state.ruleId,
        confidence: result.state.confidence,
        normalizedTail: result.state.normalizedTail,
        transition: result.transition
          ? {
              from: result.transition.from,
              to: result.transition.to,
              ruleId: result.transition.ruleId,
            }
          : undefined,
      };
      this.emit('interaction_state_changed', session.toHandle(), info);
    } catch (error) {
      this.logger.warn(
        { sessionId: session.id, error },
        'Capture feed failed'
      );
    }
  }
}
