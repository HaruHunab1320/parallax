/**
 * Tmux Session
 *
 * Manages a single tmux session for a CLI tool.
 * Mirrors PTYSession's API but uses TmuxTransport instead of node-pty.
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { CLIAdapter } from './adapters/adapter-interface.js';
import { consoleLogger } from './logger.js';
import { TmuxTransport } from './tmux-transport.js';
import type {
  AuthRequiredInfo,
  AutoResponseRule,
  BlockingPromptInfo,
  Logger,
  LoginDetection,
  SessionHandle,
  SessionMessage,
  SessionStatus,
  SpawnConfig,
  StallClassification,
  ToolRunningInfo,
} from './types.js';

export interface TmuxSessionEvents {
  output: (data: string) => void;
  ready: () => void;
  login_required: (instructions?: string, url?: string) => void;
  auth_required: (info: AuthRequiredInfo) => void;
  blocking_prompt: (prompt: BlockingPromptInfo, autoResponded: boolean) => void;
  message: (message: SessionMessage) => void;
  question: (question: string) => void;
  exit: (code: number) => void;
  error: (error: Error) => void;
  stall_detected: (recentOutput: string, stallDurationMs: number) => void;
  status_changed: (status: SessionStatus) => void;
  task_complete: () => void;
  tool_running: (info: ToolRunningInfo) => void;
}

/**
 * Special key mappings to escape sequences (for compatibility with adapters that reference SPECIAL_KEYS)
 */
export const SPECIAL_KEYS: Record<string, string> = {
  // Control keys
  'ctrl+a': '\x01',
  'ctrl+b': '\x02',
  'ctrl+c': '\x03',
  'ctrl+d': '\x04',
  'ctrl+e': '\x05',
  'ctrl+f': '\x06',
  'ctrl+g': '\x07',
  'ctrl+h': '\x08',
  'ctrl+i': '\x09',
  'ctrl+j': '\x0a',
  'ctrl+k': '\x0b',
  'ctrl+l': '\x0c',
  'ctrl+m': '\x0d',
  'ctrl+n': '\x0e',
  'ctrl+o': '\x0f',
  'ctrl+p': '\x10',
  'ctrl+q': '\x11',
  'ctrl+r': '\x12',
  'ctrl+s': '\x13',
  'ctrl+t': '\x14',
  'ctrl+u': '\x15',
  'ctrl+v': '\x16',
  'ctrl+w': '\x17',
  'ctrl+x': '\x18',
  'ctrl+y': '\x19',
  'ctrl+z': '\x1a',
  // Navigation
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  home: '\x1b[H',
  end: '\x1b[F',
  pageup: '\x1b[5~',
  pagedown: '\x1b[6~',
  // Editing
  enter: '\r',
  return: '\r',
  tab: '\t',
  backspace: '\x7f',
  delete: '\x1b[3~',
  insert: '\x1b[2~',
  escape: '\x1b',
  esc: '\x1b',
  space: ' ',
  // Function keys
  f1: '\x1bOP',
  f2: '\x1bOQ',
  f3: '\x1bOR',
  f4: '\x1bOS',
  f5: '\x1b[15~',
  f6: '\x1b[17~',
  f7: '\x1b[18~',
  f8: '\x1b[19~',
  f9: '\x1b[20~',
  f10: '\x1b[21~',
  f11: '\x1b[23~',
  f12: '\x1b[24~',
};

function generateId(): string {
  return `tmux-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export class TmuxSession extends EventEmitter {
  private transport: TmuxTransport;
  private tmuxSessionName: string;
  private outputBuffer: string = '';
  private _status: SessionStatus = 'pending';
  private _startedAt: Date | null = null;
  private _lastActivityAt: Date | null = null;
  private messageCounter: number = 0;
  private logger: Logger;
  private sessionRules: AutoResponseRule[] = [];
  private _firedOnceRules: Set<string> = new Set();
  private _lastBlockingPromptHash: string | null = null;
  private _ruleOverrides: Map<string, Partial<AutoResponseRule>> = new Map();
  private _disabledRulePatterns: Set<string> = new Set();

  // Stall detection
  private _stallTimer: ReturnType<typeof setTimeout> | null = null;
  private _stallTimeoutMs: number;
  private _stallDetectionEnabled: boolean;
  private _lastStallHash: string | null = null;
  private _stallStartedAt: number | null = null;
  private _lastContentHash: string | null = null;
  private _stallBackoffMs: number = 0;
  private static readonly MAX_STALL_BACKOFF_MS = 30_000;
  private _stallEmissionCount: number = 0;
  private static readonly MAX_STALL_EMISSIONS = 5;

  // Task completion detection
  private _taskCompleteTimer: ReturnType<typeof setTimeout> | null = null;
  private _taskCompletePending = false;
  private static readonly TASK_COMPLETE_DEBOUNCE_MS = 1500;

  // Ready detection settle delay
  private _readySettleTimer: ReturnType<typeof setTimeout> | null = null;
  private _readySettlePending = false;

  // Tool running deduplication
  private _lastToolRunningName: string | null = null;

  // Output buffer cap
  private static readonly MAX_OUTPUT_BUFFER = 100_000;

  // Poll-based exit detection
  private _exitPollTimer: ReturnType<typeof setInterval> | null = null;

  // Session prefix for tmux session naming
  private sessionPrefix: string;

  // History limit for tmux scrollback
  private historyLimit: number;

  public readonly id: string;
  public readonly config: SpawnConfig;

  constructor(
    private adapter: CLIAdapter,
    config: SpawnConfig,
    logger?: Logger,
    stallDetectionEnabled?: boolean,
    defaultStallTimeoutMs?: number,
    transport?: TmuxTransport,
    sessionPrefix?: string,
    historyLimit?: number
  ) {
    super();
    this.id = config.id || generateId();
    this.config = { ...config, id: this.id };
    this.logger = logger || consoleLogger;
    this._stallDetectionEnabled = stallDetectionEnabled ?? false;
    this._stallTimeoutMs =
      config.stallTimeoutMs ?? defaultStallTimeoutMs ?? 8000;
    this._stallBackoffMs = this._stallTimeoutMs;
    this.transport = transport || new TmuxTransport();
    this.sessionPrefix = sessionPrefix || 'parallax';
    this.historyLimit = historyLimit || 50000;
    this.tmuxSessionName = `${this.sessionPrefix}-${this.id}`;

    if (config.ruleOverrides) {
      for (const [key, value] of Object.entries(config.ruleOverrides)) {
        if (value === null) {
          this._disabledRulePatterns.add(key);
        } else {
          this._ruleOverrides.set(key, value);
        }
      }
    }
  }

  get status(): SessionStatus {
    return this._status;
  }

  get pid(): number | undefined {
    return this.transport.getPanePid(this.tmuxSessionName);
  }

  get startedAt(): Date | undefined {
    return this._startedAt ?? undefined;
  }

  get lastActivityAt(): Date | undefined {
    return this._lastActivityAt ?? undefined;
  }

  /**
   * Get the tmux session name (for reconnection/debugging).
   */
  get tmuxName(): string {
    return this.tmuxSessionName;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Runtime Auto-Response Rules API
  // ─────────────────────────────────────────────────────────────────────────────

  addAutoResponseRule(rule: AutoResponseRule): void {
    const existingIndex = this.sessionRules.findIndex(
      (r) =>
        r.pattern.source === rule.pattern.source &&
        r.pattern.flags === rule.pattern.flags
    );

    if (existingIndex >= 0) {
      this.sessionRules[existingIndex] = rule;
    } else {
      this.sessionRules.push(rule);
    }
  }

  removeAutoResponseRule(pattern: RegExp): boolean {
    const initialLength = this.sessionRules.length;
    this.sessionRules = this.sessionRules.filter(
      (r) =>
        !(
          r.pattern.source === pattern.source &&
          r.pattern.flags === pattern.flags
        )
    );
    return this.sessionRules.length < initialLength;
  }

  setAutoResponseRules(rules: AutoResponseRule[]): void {
    this.sessionRules = [...rules];
  }

  getAutoResponseRules(): AutoResponseRule[] {
    return [...this.sessionRules];
  }

  clearAutoResponseRules(): void {
    this.sessionRules = [];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Stall Detection
  // ─────────────────────────────────────────────────────────────────────────────

  private resetStallTimer(): void {
    if (
      !this._stallDetectionEnabled ||
      (this._status !== 'busy' && this._status !== 'authenticating')
    ) {
      this.clearStallTimer();
      return;
    }

    const stripped = this.stripAnsiForStall(this.outputBuffer).trim();
    const tail = stripped.slice(-500);
    const hash = this.simpleHash(tail);

    if (hash === this._lastContentHash) {
      return;
    }
    this._lastContentHash = hash;
    this._stallEmissionCount = 0;

    if (this._stallTimer) {
      clearTimeout(this._stallTimer);
      this._stallTimer = null;
    }
    this._stallStartedAt = Date.now();
    this._lastStallHash = null;
    this._stallBackoffMs = this._stallTimeoutMs;

    this._stallTimer = setTimeout(() => {
      this.onStallTimerFired();
    }, this._stallTimeoutMs);
  }

  private clearStallTimer(): void {
    if (this._stallTimer) {
      clearTimeout(this._stallTimer);
      this._stallTimer = null;
    }
    this._stallStartedAt = null;
    this._lastContentHash = null;
    this._stallBackoffMs = this._stallTimeoutMs;
    this._stallEmissionCount = 0;
  }

  private onStallTimerFired(): void {
    if (this._status !== 'busy' && this._status !== 'authenticating') {
      return;
    }

    // Fast path: adapter task completion
    if (
      this._status === 'busy' &&
      this.adapter.detectTaskComplete?.(this.outputBuffer)
    ) {
      this._status = 'ready';
      this._lastBlockingPromptHash = null;
      const completedOutput = this.outputBuffer;
      this.outputBuffer = '';
      this.clearStallTimer();
      this.emit('status_changed', 'ready');
      this.emit('task_complete', { output: completedOutput });
      this.logger.info(
        { sessionId: this.id },
        'Task complete (adapter fast-path)'
      );
      return;
    }

    // Loading suppression
    if (this.adapter.detectLoading?.(this.outputBuffer)) {
      this._stallTimer = setTimeout(
        () => this.onStallTimerFired(),
        this._stallBackoffMs
      );
      return;
    }

    // Tool running suppression
    const toolInfo = this.adapter.detectToolRunning?.(this.outputBuffer);
    if (toolInfo) {
      if (toolInfo.toolName !== this._lastToolRunningName) {
        this._lastToolRunningName = toolInfo.toolName;
        this.emit('tool_running', toolInfo);
      }
      this._stallTimer = setTimeout(
        () => this.onStallTimerFired(),
        this._stallBackoffMs
      );
      return;
    }
    if (this._lastToolRunningName) {
      this._lastToolRunningName = null;
    }

    // Dedup hash check
    const tail = this.outputBuffer.slice(-500);
    const hash = this.simpleHash(tail);
    if (hash === this._lastStallHash) {
      this._stallTimer = setTimeout(
        () => this.onStallTimerFired(),
        this._stallBackoffMs
      );
      return;
    }
    this._lastStallHash = hash;

    this._stallEmissionCount++;
    if (this._stallEmissionCount > TmuxSession.MAX_STALL_EMISSIONS) {
      this.logger.warn({ sessionId: this.id }, 'Max stall emissions reached');
      this.clearStallTimer();
      return;
    }

    const recentRaw = this.outputBuffer.slice(-2000);
    const recentOutput = this.stripAnsiForClassifier(recentRaw).trim();
    const stallDurationMs = this._stallStartedAt
      ? Date.now() - this._stallStartedAt
      : this._stallTimeoutMs;

    this.emit('stall_detected', recentOutput, stallDurationMs);
    this._stallTimer = setTimeout(
      () => this.onStallTimerFired(),
      this._stallBackoffMs
    );
  }

  handleStallClassification(classification: StallClassification | null): void {
    if (this._status !== 'busy' && this._status !== 'authenticating') {
      return;
    }

    if (!classification || classification.state === 'still_working') {
      this._stallBackoffMs = Math.min(
        this._stallBackoffMs * 2,
        TmuxSession.MAX_STALL_BACKOFF_MS
      );
      this._lastContentHash = null;
      this._lastStallHash = null;
      if (this._stallTimer) {
        clearTimeout(this._stallTimer);
        this._stallTimer = null;
      }
      this._stallTimer = setTimeout(
        () => this.onStallTimerFired(),
        this._stallBackoffMs
      );
      return;
    }

    switch (classification.state) {
      case 'waiting_for_input': {
        const promptInfo: BlockingPromptInfo = {
          type: 'stall_classified',
          prompt: classification.prompt,
          canAutoRespond: !!classification.suggestedResponse,
        };

        if (classification.suggestedResponse) {
          const resp = classification.suggestedResponse;
          if (resp.startsWith('keys:')) {
            const keys = resp
              .slice(5)
              .split(',')
              .map((k) => k.trim());
            this.sendKeySequence(keys);
          } else {
            this.transport.sendText(this.tmuxSessionName, resp);
            this.transport.sendKey(this.tmuxSessionName, 'enter');
          }
          this.outputBuffer = '';
          this.emit('blocking_prompt', promptInfo, true);
        } else {
          this.emit('blocking_prompt', promptInfo, false);
        }
        break;
      }

      case 'task_complete':
        this._status = 'ready';
        this._lastBlockingPromptHash = null;
        this.outputBuffer = '';
        this.clearStallTimer();
        this.emit('ready');
        break;

      case 'error':
        this.clearStallTimer();
        this.emit(
          'error',
          new Error(classification.prompt || 'Stall classified as error')
        );
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Task Completion Detection
  // ─────────────────────────────────────────────────────────────────────────────

  private scheduleTaskComplete(): void {
    if (this._taskCompleteTimer) {
      clearTimeout(this._taskCompleteTimer);
    }
    this._taskCompletePending = true;

    this._taskCompleteTimer = setTimeout(() => {
      this._taskCompleteTimer = null;
      this._taskCompletePending = false;

      const signal = this.isTaskCompleteSignal(this.outputBuffer);
      if (this._status !== 'busy') return;
      if (!signal) return;

      this._status = 'ready';
      this._lastBlockingPromptHash = null;
      const completedOutput = this.outputBuffer;
      this.outputBuffer = '';
      this.clearStallTimer();
      this.emit('status_changed', 'ready');
      this.emit('task_complete', { output: completedOutput });
      this.logger.info(
        { sessionId: this.id },
        'Task complete — agent returned to idle prompt'
      );
    }, TmuxSession.TASK_COMPLETE_DEBOUNCE_MS);
  }

  private isTaskCompleteSignal(output: string): boolean {
    if (this.adapter.detectTaskComplete) {
      return this.adapter.detectTaskComplete(output);
    }
    return this.adapter.detectReady(output);
  }

  private cancelTaskComplete(): void {
    if (this._taskCompleteTimer) {
      clearTimeout(this._taskCompleteTimer);
      this._taskCompleteTimer = null;
    }
    this._taskCompletePending = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Ready Detection Settle Delay
  // ─────────────────────────────────────────────────────────────────────────────

  private scheduleReadySettle(): void {
    this._readySettlePending = true;
    if (this._readySettleTimer) {
      clearTimeout(this._readySettleTimer);
    }
    const settleMs =
      this.config.readySettleMs ?? this.adapter.readySettleMs ?? 100;
    this._readySettleTimer = setTimeout(() => {
      this._readySettleTimer = null;
      this._readySettlePending = false;
      if (this._status !== 'starting' && this._status !== 'authenticating')
        return;
      if (!this.adapter.detectReady(this.outputBuffer)) return;
      this._status = 'ready';
      this._lastBlockingPromptHash = null;
      this.outputBuffer = '';
      this.clearStallTimer();
      this.emit('ready');
      this.logger.info({ sessionId: this.id }, 'Session ready (after settle)');
    }, settleMs);
  }

  private cancelReadySettle(): void {
    if (this._readySettleTimer) {
      clearTimeout(this._readySettleTimer);
      this._readySettleTimer = null;
    }
    this._readySettlePending = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this._status = 'starting';
    this._startedAt = new Date();

    const command = this.adapter.getCommand();
    const args = this.adapter.getArgs(this.config);
    const adapterEnv = this.adapter.getEnv(this.config);
    const env = TmuxSession.buildSpawnEnv(this.config, adapterEnv);

    this.logger.info(
      {
        sessionId: this.id,
        command,
        args: args.join(' '),
        tmuxSession: this.tmuxSessionName,
      },
      'Starting tmux session'
    );

    try {
      this.transport.spawn(this.tmuxSessionName, {
        command,
        args,
        cwd: this.config.workdir || process.cwd(),
        env,
        cols: this.config.cols || 120,
        rows: this.config.rows || 40,
        historyLimit: this.historyLimit,
      });

      // Start streaming output
      this.transport.startOutputStreaming(this.tmuxSessionName, (data) => {
        this._lastActivityAt = new Date();
        this.outputBuffer += data;

        if (this.outputBuffer.length > TmuxSession.MAX_OUTPUT_BUFFER) {
          this.outputBuffer = this.outputBuffer.slice(
            -TmuxSession.MAX_OUTPUT_BUFFER
          );
        }

        this.emit('output', data);
        this.processOutputBuffer();
      });

      // Poll for process exit (tmux remain-on-exit keeps the pane alive)
      this._exitPollTimer = setInterval(() => {
        if (!this.transport.isPaneAlive(this.tmuxSessionName)) {
          const exitCode =
            this.transport.getPaneExitStatus(this.tmuxSessionName) ?? 0;
          this.handleExit(exitCode);
        }
      }, 1000);

      this.logger.info(
        {
          sessionId: this.id,
          pid: this.pid,
          tmuxSession: this.tmuxSessionName,
        },
        'Tmux session started'
      );
    } catch (error) {
      this._status = 'error';
      this.logger.error(
        { sessionId: this.id, error },
        'Failed to start tmux session'
      );
      throw error;
    }
  }

  /**
   * Reconnect to an existing tmux session.
   * Used for crash recovery.
   */
  async reconnect(existingTmuxName: string): Promise<void> {
    if (!this.transport.isAlive(existingTmuxName)) {
      throw new Error(`Tmux session ${existingTmuxName} does not exist`);
    }

    this.tmuxSessionName = existingTmuxName;
    this._status = 'starting';
    this._startedAt = new Date();

    // Re-attach output streaming
    this.transport.startOutputStreaming(this.tmuxSessionName, (data) => {
      this._lastActivityAt = new Date();
      this.outputBuffer += data;

      if (this.outputBuffer.length > TmuxSession.MAX_OUTPUT_BUFFER) {
        this.outputBuffer = this.outputBuffer.slice(
          -TmuxSession.MAX_OUTPUT_BUFFER
        );
      }

      this.emit('output', data);
      this.processOutputBuffer();
    });

    // Capture current pane content to seed the output buffer
    const currentContent = this.transport.capturePane(this.tmuxSessionName, {
      ansi: true,
    });
    if (currentContent) {
      this.outputBuffer = currentContent;
      this.processOutputBuffer();
    }

    // Start exit polling
    this._exitPollTimer = setInterval(() => {
      if (!this.transport.isPaneAlive(this.tmuxSessionName)) {
        const exitCode =
          this.transport.getPaneExitStatus(this.tmuxSessionName) ?? 0;
        this.handleExit(exitCode);
      }
    }, 1000);

    this.logger.info(
      { sessionId: this.id, tmuxSession: this.tmuxSessionName },
      'Reconnected to tmux session'
    );
  }

  private handleExit(exitCode: number): void {
    if (this._status === 'stopped' || this._status === 'stopping') return;
    this._status = 'stopped';
    this.clearStallTimer();
    this.cancelTaskComplete();
    this.cancelReadySettle();
    this.stopExitPolling();
    this.transport.stopOutputStreaming(this.tmuxSessionName);
    this.logger.info({ sessionId: this.id, exitCode }, 'Tmux session exited');
    this.emit('exit', exitCode);
  }

  private stopExitPolling(): void {
    if (this._exitPollTimer) {
      clearInterval(this._exitPollTimer);
      this._exitPollTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Output Processing
  // ─────────────────────────────────────────────────────────────────────────────

  private processOutputBuffer(): void {
    if (this._status === 'busy' || this._status === 'authenticating') {
      this.resetStallTimer();
    }

    if (this._readySettlePending) {
      if (
        (this._status === 'starting' || this._status === 'authenticating') &&
        this.adapter.detectReady(this.outputBuffer)
      ) {
        this.scheduleReadySettle();
      } else {
        this.cancelReadySettle();
      }
      return;
    }

    // Ready detection
    if (
      (this._status === 'starting' || this._status === 'authenticating') &&
      this.adapter.detectReady(this.outputBuffer)
    ) {
      this.scheduleReadySettle();
      return;
    }

    // Tool running detection
    if (this._status === 'busy') {
      const toolInfo = this.adapter.detectToolRunning?.(this.outputBuffer);
      if (toolInfo) {
        if (toolInfo.toolName !== this._lastToolRunningName) {
          this._lastToolRunningName = toolInfo.toolName;
          this.emit('tool_running', toolInfo);
        }
      } else if (this._lastToolRunningName) {
        this._lastToolRunningName = null;
      }
    }

    // Task completion detection
    if (this._status === 'busy') {
      const signal = this.isTaskCompleteSignal(this.outputBuffer);
      if (this._taskCompletePending || signal) {
        this.scheduleTaskComplete();
      }
    }

    // Auto-response / blocking prompt detection
    // Skip during 'busy' — the agent is processing a task we just sent.
    // Auto-responding during busy state sends stray keys that corrupt input.
    if (
      this._status !== 'stopping' &&
      this._status !== 'stopped' &&
      this._status !== 'busy'
    ) {
      const blockingPrompt = this.detectAndHandleBlockingPrompt();
      if (blockingPrompt) return;
    }

    // Login detection
    if (this._status !== 'ready' && this._status !== 'busy') {
      const loginDetection = this.adapter.detectLogin(this.outputBuffer);
      if (loginDetection.required && this._status !== 'authenticating') {
        this._status = 'authenticating';
        this.clearStallTimer();
        this.emitAuthRequired({
          type: loginDetection.type,
          url: loginDetection.url,
          deviceCode: loginDetection.deviceCode,
          instructions: loginDetection.instructions,
        });
        return;
      }
    }

    // Exit detection (adapter-level)
    const exitDetection = this.adapter.detectExit(this.outputBuffer);
    if (exitDetection.exited) {
      this._status = 'stopped';
      this.clearStallTimer();
      this.emit('exit', exitDetection.code || 0);
    }

    // Parse output when ready
    if (this._status === 'ready') {
      this.tryParseOutput();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Blocking Prompt Detection & Auto-Response
  // ─────────────────────────────────────────────────────────────────────────────

  private detectAndHandleBlockingPrompt(): boolean {
    const autoHandled = this.tryAutoResponse();
    if (autoHandled) return true;

    if (this.adapter.detectBlockingPrompt) {
      const detection = this.adapter.detectBlockingPrompt(this.outputBuffer);

      if (detection.detected) {
        const normalizedPrompt = (detection.prompt || '')
          .replace(/\s+/g, ' ')
          .replace(/\d+/g, '#')
          .trim()
          .slice(0, 100);
        const promptHash = `${detection.type}:${normalizedPrompt}`;
        if (promptHash === this._lastBlockingPromptHash) return true;
        this._lastBlockingPromptHash = promptHash;

        const promptInfo: BlockingPromptInfo = {
          type: detection.type || 'unknown',
          prompt: detection.prompt,
          options: detection.options,
          canAutoRespond: detection.canAutoRespond || false,
          instructions: detection.instructions,
          url: detection.url,
        };

        if (
          detection.canAutoRespond &&
          detection.suggestedResponse &&
          !this.config.skipAdapterAutoResponse
        ) {
          const resp = detection.suggestedResponse;
          if (resp.startsWith('keys:')) {
            const keys = resp
              .slice(5)
              .split(',')
              .map((k) => k.trim());
            this.sendKeySequence(keys);
          } else {
            this.transport.sendText(this.tmuxSessionName, resp);
            this.transport.sendKey(this.tmuxSessionName, 'enter');
          }
          this.outputBuffer = '';
          this.emit('blocking_prompt', promptInfo, true);
          return true;
        }

        if (detection.type === 'login') {
          this._status = 'authenticating';
          const inferred = this.adapter.detectLogin(this.outputBuffer);
          this.emitAuthRequired({
            type: inferred.required ? inferred.type : undefined,
            url: detection.url ?? inferred.url,
            deviceCode: inferred.required ? inferred.deviceCode : undefined,
            instructions: detection.instructions ?? inferred.instructions,
          });
        }

        this.emit('blocking_prompt', promptInfo, false);
        return true;
      } else {
        this._lastBlockingPromptHash = null;
      }
    }

    return false;
  }

  private tryAutoResponse(): boolean {
    const adapterRules = (this.adapter.autoResponseRules || [])
      .filter((r) => !this._disabledRulePatterns.has(r.pattern.source))
      .map((r) => {
        const override = this._ruleOverrides.get(r.pattern.source);
        return override ? { ...r, ...override } : r;
      });
    const allRules = [...this.sessionRules, ...adapterRules];

    if (allRules.length === 0) return false;

    const stripped = this.stripAnsiForStall(this.outputBuffer);

    for (const rule of allRules) {
      if (rule.once) {
        const ruleKey = `${rule.pattern.source}:${rule.pattern.flags}`;
        if (this._firedOnceRules.has(ruleKey)) continue;
      }

      if (rule.pattern.test(stripped)) {
        const safe = rule.safe !== false;

        if (safe) {
          const useKeys = rule.keys && rule.keys.length > 0;
          const isTuiDefault =
            !rule.responseType && !rule.keys && this.adapter.usesTuiMenus;

          if (useKeys) {
            this.sendKeySequence(rule.keys!);
          } else if (isTuiDefault) {
            this.sendKeys('enter');
          } else {
            this.transport.sendText(this.tmuxSessionName, rule.response);
            this.transport.sendKey(this.tmuxSessionName, 'enter');
          }

          if (rule.once) {
            const ruleKey = `${rule.pattern.source}:${rule.pattern.flags}`;
            this._firedOnceRules.add(ruleKey);
          }

          this.outputBuffer = '';

          const promptInfo: BlockingPromptInfo = {
            type: rule.type,
            prompt: rule.description,
            canAutoRespond: true,
          };

          this.emit('blocking_prompt', promptInfo, true);
          return true;
        } else {
          const promptInfo: BlockingPromptInfo = {
            type: rule.type,
            prompt: rule.description,
            canAutoRespond: false,
            instructions: `Prompt matched but requires user confirmation: ${rule.description}`,
          };
          this.emit('blocking_prompt', promptInfo, false);
          return true;
        }
      }
    }

    return false;
  }

  private tryParseOutput(): void {
    const parsed = this.adapter.parseOutput(this.outputBuffer);

    if (parsed?.isComplete) {
      this.outputBuffer = '';

      const message: SessionMessage = {
        id: `${this.id}-msg-${++this.messageCounter}`,
        sessionId: this.id,
        direction: 'outbound',
        type: parsed.type,
        content: parsed.content,
        metadata: parsed.metadata,
        timestamp: new Date(),
      };

      this.emit('message', message);

      if (parsed.isQuestion) {
        this.emit('question', parsed.content);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // I/O Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Write data to the session (formatted by adapter, with Enter)
   */
  write(data: string): void {
    this._lastActivityAt = new Date();
    const formatted = this.adapter.formatInput(data);
    this.transport.sendText(this.tmuxSessionName, formatted);
    this.transport.sendKey(this.tmuxSessionName, 'enter');
  }

  /**
   * Write raw data directly (no formatting, no Enter)
   */
  writeRaw(data: string): void {
    this._lastActivityAt = new Date();
    this.transport.sendText(this.tmuxSessionName, data);
  }

  /**
   * Send a task/message to the session
   */
  send(message: string): SessionMessage {
    this._status = 'busy';
    this.outputBuffer = '';
    this.emit('status_changed', 'busy');
    this._stallEmissionCount = 0;
    this.resetStallTimer();

    const msg: SessionMessage = {
      id: `${this.id}-msg-${++this.messageCounter}`,
      sessionId: this.id,
      direction: 'inbound',
      type: 'task',
      content: message,
      timestamp: new Date(),
    };

    const formatted = this.adapter.formatInput(message);
    this.transport.sendText(this.tmuxSessionName, formatted);

    // Send Enter after text delivery. The transport.sendText is synchronous
    // (execSync per chunk), so all text is delivered when it returns.
    // Use setTimeout (not execSync sleep) to avoid blocking the event loop
    // which would prevent gateway heartbeats and output monitoring.
    const sessionName = this.tmuxSessionName;
    const transport = this.transport;
    setTimeout(() => {
      transport.sendKey(sessionName, 'enter');
    }, 1500);

    return msg;
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    this.transport.resize(this.tmuxSessionName, cols, rows);
  }

  /**
   * Send special keys to the session.
   * Uses tmux send-keys with named keys.
   */
  sendKeys(keys: string | string[]): void {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const normalized = TmuxSession.normalizeKeyList(keyList);
    this._stallEmissionCount = 0;
    this._lastBlockingPromptHash = null;
    this.outputBuffer = '';
    this.resetStallTimer();

    for (const key of normalized) {
      this._lastActivityAt = new Date();
      this.transport.sendKey(this.tmuxSessionName, key);
    }
  }

  /**
   * Select a TUI menu option by index (0-based).
   */
  async selectMenuOption(optionIndex: number): Promise<void> {
    for (let i = 0; i < optionIndex; i++) {
      this.sendKeys('down');
      await this.delay(50);
    }
    this.sendKeys('enter');
  }

  /**
   * Send a sequence of keys with staggered timing.
   */
  private sendKeySequence(keys: string[]): void {
    keys.forEach((key, i) => {
      setTimeout(() => this.sendKeys(key), i * 50);
    });
  }

  /**
   * Paste text using bracketed paste mode
   */
  paste(text: string, useBracketedPaste: boolean = true): void {
    this._lastActivityAt = new Date();

    if (useBracketedPaste) {
      // Send bracketed paste escape sequences around the text
      this.transport.sendText(
        this.tmuxSessionName,
        `\x1b[200~${text}\x1b[201~`
      );
    } else {
      this.transport.sendText(this.tmuxSessionName, text);
    }
  }

  /**
   * Notify the session of an external hook event.
   */
  notifyHookEvent(event: string): void {
    switch (event) {
      case 'tool_running':
        this._lastActivityAt = new Date();
        this.resetStallTimer();
        break;
      case 'task_complete': {
        this._status = 'ready';
        this._lastBlockingPromptHash = null;
        const hookOutput = this.outputBuffer;
        this.outputBuffer = '';
        this.clearStallTimer();
        this.emit('status_changed', 'ready');
        this.emit('task_complete', { output: hookOutput });
        break;
      }
      case 'permission_approved':
        this._lastActivityAt = new Date();
        this.outputBuffer = '';
        this.resetStallTimer();
        break;
      default:
        this._lastActivityAt = new Date();
        this.resetStallTimer();
        break;
    }
  }

  /**
   * Kill the session.
   */
  kill(signal?: string): void {
    this._status = 'stopping';
    this.clearStallTimer();
    this.cancelTaskComplete();
    this.cancelReadySettle();
    this.stopExitPolling();

    if (signal === 'SIGKILL') {
      // Force kill: signal the process then destroy the tmux session
      this.transport.signal(this.tmuxSessionName, 'SIGKILL');
      setTimeout(() => {
        this.transport.kill(this.tmuxSessionName);
        this._status = 'stopped';
        this.emit('exit', 137);
      }, 200);
    } else {
      // Graceful: send SIGTERM and let the process exit
      this.transport.signal(this.tmuxSessionName, signal || 'SIGTERM');
    }

    this.logger.info({ sessionId: this.id, signal }, 'Killing tmux session');
  }

  /**
   * Get current output buffer
   */
  getOutputBuffer(): string {
    return this.outputBuffer;
  }

  /**
   * Clear output buffer
   */
  clearOutputBuffer(): void {
    this.outputBuffer = '';
  }

  /**
   * Convert to SessionHandle
   */
  toHandle(): SessionHandle {
    return {
      id: this.id,
      name: this.config.name,
      type: this.config.type,
      status: this._status,
      pid: this.pid,
      startedAt: this._startedAt ?? undefined,
      lastActivityAt: this._lastActivityAt ?? undefined,
      tmuxSessionName: this.tmuxSessionName,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Static Utilities
  // ─────────────────────────────────────────────────────────────────────────────

  static buildSpawnEnv(
    config: SpawnConfig,
    adapterEnv: Record<string, string>
  ): Record<string, string> {
    const baseEnv = config.inheritProcessEnv !== false ? process.env : {};
    return {
      ...baseEnv,
      ...adapterEnv,
      ...config.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>;
  }

  static normalizeKeyList(keys: string[]): string[] {
    const MODIFIER_MAP: Record<string, string> = {
      control: 'ctrl',
      command: 'meta',
      cmd: 'meta',
      option: 'alt',
      opt: 'alt',
    };

    const MODIFIER_NAMES = new Set([
      'ctrl',
      'alt',
      'shift',
      'meta',
      ...Object.keys(MODIFIER_MAP),
    ]);

    const result: string[] = [];
    let i = 0;

    while (i < keys.length) {
      let key = keys[i].toLowerCase().trim();

      if (MODIFIER_MAP[key]) {
        key = MODIFIER_MAP[key];
      }

      if (MODIFIER_NAMES.has(key) && i + 1 < keys.length) {
        let nextKey = keys[i + 1].toLowerCase().trim();
        if (MODIFIER_MAP[nextKey]) {
          nextKey = MODIFIER_MAP[nextKey];
        }
        if (!MODIFIER_NAMES.has(nextKey)) {
          result.push(`${key}+${nextKey}`);
          i += 2;
          continue;
        }
      }

      result.push(key);
      i++;
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  private mapLoginTypeToAuthMethod(
    type: LoginDetection['type'] | undefined
  ): AuthRequiredInfo['method'] {
    switch (type) {
      case 'api_key':
        return 'api_key';
      case 'cli_auth':
        return 'cli_auth';
      case 'device_code':
        return 'device_code';
      case 'oauth':
      case 'browser':
        return 'oauth_browser';
      default:
        return 'unknown';
    }
  }

  private emitAuthRequired(details: {
    type?: LoginDetection['type'];
    url?: string;
    deviceCode?: string;
    instructions?: string;
  }): void {
    const info: AuthRequiredInfo = {
      method: this.mapLoginTypeToAuthMethod(details.type),
      url: details.url,
      deviceCode: details.deviceCode,
      instructions: details.instructions,
    };

    this.emit('auth_required', info);
    this.emit('login_required', info.instructions, info.url);
  }

  /**
   * Strip ANSI codes for stall detection hashing.
   * Simplified compared to pty-manager since tmux capture-pane can give clean text.
   */
  private stripAnsiForStall(str: string): string {
    let result = str.replace(/\x1b\[\d*[CDABGdEF]/g, ' ');
    result = result.replace(/\x1b\[\d*(?:;\d+)?[Hf]/g, ' ');
    result = result.replace(/\x1b\[\d*[JK]/g, ' ');
    result = result.replace(
      /\x1b\](?:[^\x07\x1b]|\x1b[^\\])*(?:\x07|\x1b\\)/g,
      ''
    );
    result = result.replace(/\x1bP(?:[^\x1b]|\x1b[^\\])*\x1b\\/g, '');
    // eslint-disable-next-line no-control-regex
    result = result.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
    result = result.replace(/\xa0/g, ' ');
    result = result.replace(
      /[│╭╰╮╯─═╌║╔╗╚╝╠╣╦╩╬┌┐└┘├┤┬┴┼●○❯❮▶◀⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷✻✶✳✢⏺←→↑↓⬆⬇◆◇▪▫■□▲△▼▽◈⟨⟩⌘⏎⏏⌫⌦⇧⇪⌥]/g,
      ' '
    );
    result = result.replace(/\d+[hms](?:\s+\d+[hms])*/g, '0s');
    result = result.replace(/ {2,}/g, ' ');
    return result;
  }

  /**
   * Less-aggressive ANSI stripping for classifier context.
   */
  private stripAnsiForClassifier(str: string): string {
    let result = str.replace(/\x1b\[\d*[CDABGdEF]/g, ' ');
    result = result.replace(/\x1b\[\d*(?:;\d+)?[Hf]/g, ' ');
    result = result.replace(/\x1b\[\d*[JK]/g, ' ');
    result = result.replace(
      /\x1b\](?:[^\x07\x1b]|\x1b[^\\])*(?:\x07|\x1b\\)/g,
      ''
    );
    result = result.replace(/\x1bP(?:[^\x1b]|\x1b[^\\])*\x1b\\/g, '');
    // eslint-disable-next-line no-control-regex
    result = result.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
    result = result.replace(/\xa0/g, ' ');
    result = result.replace(/ {2,}/g, ' ');
    return result;
  }
}
