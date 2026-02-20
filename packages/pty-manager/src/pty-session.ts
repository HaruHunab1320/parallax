/**
 * PTY Session
 *
 * Manages a single pseudo-terminal session for a CLI tool.
 */

import { EventEmitter } from 'events';
import type * as ptyModule from 'node-pty';
import type { CLIAdapter } from './adapters/adapter-interface';
import type {
  SpawnConfig,
  SessionStatus,
  SessionHandle,
  SessionMessage,
  BlockingPromptInfo,
  AutoResponseRule,
  StallClassification,
  Logger,
} from './types';

// Lazy-load node-pty to avoid issues in environments where it's not installed
let ptyCache: typeof ptyModule | null = null;
function loadPty(): typeof ptyModule {
  if (!ptyCache) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ptyCache = require('node-pty') as typeof ptyModule;
    } catch {
      throw new Error(
        'node-pty is required but not installed. Run: npm install node-pty'
      );
    }
  }
  return ptyCache!;
}

export interface PTYSessionEvents {
  output: (data: string) => void;
  ready: () => void;
  login_required: (instructions?: string, url?: string) => void;
  blocking_prompt: (prompt: BlockingPromptInfo, autoResponded: boolean) => void;
  message: (message: SessionMessage) => void;
  question: (question: string) => void;
  exit: (code: number) => void;
  error: (error: Error) => void;
  stall_detected: (recentOutput: string, stallDurationMs: number) => void;
  status_changed: (status: SessionStatus) => void;
  task_complete: () => void;
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

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `pty-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Special key mappings to escape sequences
 *
 * Modifier codes for arrows/function keys:
 * 2 = Shift, 3 = Alt, 4 = Shift+Alt, 5 = Ctrl, 6 = Ctrl+Shift, 7 = Ctrl+Alt, 8 = Ctrl+Alt+Shift
 */
export const SPECIAL_KEYS: Record<string, string> = {
  // Control keys (Ctrl+letter = ASCII control code)
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
  'ctrl+[': '\x1b',
  'ctrl+\\': '\x1c',
  'ctrl+]': '\x1d',
  'ctrl+^': '\x1e',
  'ctrl+_': '\x1f',

  // Alt+letter (Meta key = ESC + letter)
  'alt+a': '\x1ba', 'alt+b': '\x1bb', 'alt+c': '\x1bc', 'alt+d': '\x1bd',
  'alt+e': '\x1be', 'alt+f': '\x1bf', 'alt+g': '\x1bg', 'alt+h': '\x1bh',
  'alt+i': '\x1bi', 'alt+j': '\x1bj', 'alt+k': '\x1bk', 'alt+l': '\x1bl',
  'alt+m': '\x1bm', 'alt+n': '\x1bn', 'alt+o': '\x1bo', 'alt+p': '\x1bp',
  'alt+q': '\x1bq', 'alt+r': '\x1br', 'alt+s': '\x1bs', 'alt+t': '\x1bt',
  'alt+u': '\x1bu', 'alt+v': '\x1bv', 'alt+w': '\x1bw', 'alt+x': '\x1bx',
  'alt+y': '\x1by', 'alt+z': '\x1bz',
  'alt+backspace': '\x1b\x7f',  // Delete word backward

  // Navigation - plain
  'up': '\x1b[A',
  'down': '\x1b[B',
  'right': '\x1b[C',
  'left': '\x1b[D',
  'home': '\x1b[H',
  'end': '\x1b[F',
  'pageup': '\x1b[5~',
  'pagedown': '\x1b[6~',

  // Navigation - with Shift (modifier 2)
  'shift+up': '\x1b[1;2A',
  'shift+down': '\x1b[1;2B',
  'shift+right': '\x1b[1;2C',
  'shift+left': '\x1b[1;2D',
  'shift+home': '\x1b[1;2H',
  'shift+end': '\x1b[1;2F',
  'shift+pageup': '\x1b[5;2~',
  'shift+pagedown': '\x1b[6;2~',

  // Navigation - with Alt (modifier 3)
  'alt+up': '\x1b[1;3A',
  'alt+down': '\x1b[1;3B',
  'alt+right': '\x1b[1;3C',    // Forward word
  'alt+left': '\x1b[1;3D',     // Backward word

  // Navigation - with Ctrl (modifier 5)
  'ctrl+up': '\x1b[1;5A',
  'ctrl+down': '\x1b[1;5B',
  'ctrl+right': '\x1b[1;5C',   // Forward word
  'ctrl+left': '\x1b[1;5D',    // Backward word
  'ctrl+home': '\x1b[1;5H',
  'ctrl+end': '\x1b[1;5F',

  // Navigation - with Ctrl+Shift (modifier 6) - select word
  'ctrl+shift+up': '\x1b[1;6A',
  'ctrl+shift+down': '\x1b[1;6B',
  'ctrl+shift+right': '\x1b[1;6C',
  'ctrl+shift+left': '\x1b[1;6D',
  'ctrl+shift+home': '\x1b[1;6H',
  'ctrl+shift+end': '\x1b[1;6F',

  // Navigation - with Shift+Alt (modifier 4)
  'shift+alt+up': '\x1b[1;4A',
  'shift+alt+down': '\x1b[1;4B',
  'shift+alt+right': '\x1b[1;4C',
  'shift+alt+left': '\x1b[1;4D',

  // Editing
  'enter': '\r',
  'return': '\r',
  'tab': '\t',
  'shift+tab': '\x1b[Z',       // Reverse tab
  'backspace': '\x7f',
  'delete': '\x1b[3~',
  'shift+delete': '\x1b[3;2~',
  'ctrl+delete': '\x1b[3;5~',  // Delete word forward
  'insert': '\x1b[2~',
  'escape': '\x1b',
  'esc': '\x1b',
  'space': ' ',

  // Function keys - plain
  'f1': '\x1bOP',
  'f2': '\x1bOQ',
  'f3': '\x1bOR',
  'f4': '\x1bOS',
  'f5': '\x1b[15~',
  'f6': '\x1b[17~',
  'f7': '\x1b[18~',
  'f8': '\x1b[19~',
  'f9': '\x1b[20~',
  'f10': '\x1b[21~',
  'f11': '\x1b[23~',
  'f12': '\x1b[24~',

  // Function keys - with Shift (modifier 2)
  'shift+f1': '\x1b[1;2P',
  'shift+f2': '\x1b[1;2Q',
  'shift+f3': '\x1b[1;2R',
  'shift+f4': '\x1b[1;2S',
  'shift+f5': '\x1b[15;2~',
  'shift+f6': '\x1b[17;2~',
  'shift+f7': '\x1b[18;2~',
  'shift+f8': '\x1b[19;2~',
  'shift+f9': '\x1b[20;2~',
  'shift+f10': '\x1b[21;2~',
  'shift+f11': '\x1b[23;2~',
  'shift+f12': '\x1b[24;2~',

  // Function keys - with Ctrl (modifier 5)
  'ctrl+f1': '\x1b[1;5P',
  'ctrl+f2': '\x1b[1;5Q',
  'ctrl+f3': '\x1b[1;5R',
  'ctrl+f4': '\x1b[1;5S',
  'ctrl+f5': '\x1b[15;5~',
  'ctrl+f6': '\x1b[17;5~',
  'ctrl+f7': '\x1b[18;5~',
  'ctrl+f8': '\x1b[19;5~',
  'ctrl+f9': '\x1b[20;5~',
  'ctrl+f10': '\x1b[21;5~',
  'ctrl+f11': '\x1b[23;5~',
  'ctrl+f12': '\x1b[24;5~',
};

/**
 * Bracketed paste mode escape sequences
 */
const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

export class PTYSession extends EventEmitter {
  private ptyProcess: ptyModule.IPty | null = null;
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

  // Task completion detection (idle detection when busy)
  private _taskCompleteTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly TASK_COMPLETE_DEBOUNCE_MS = 1500;

  // Ready detection settle delay — defers session_ready until output goes quiet
  private _readySettleTimer: ReturnType<typeof setTimeout> | null = null;
  private _readySettlePending = false;

  // Deferred output processing — prevents node-pty's synchronous data
  // delivery from starving the event loop (timers, I/O callbacks, etc.)
  private _processScheduled = false;

  // Output buffer cap — prevents unbounded growth during long tasks
  private static readonly MAX_OUTPUT_BUFFER = 100_000; // 100 KB

  public readonly id: string;
  public readonly config: SpawnConfig;

  constructor(
    private adapter: CLIAdapter,
    config: SpawnConfig,
    logger?: Logger,
    stallDetectionEnabled?: boolean,
    defaultStallTimeoutMs?: number,
  ) {
    super();
    this.id = config.id || generateId();
    this.config = { ...config, id: this.id };
    this.logger = logger || consoleLogger;
    this._stallDetectionEnabled = stallDetectionEnabled ?? false;
    this._stallTimeoutMs = config.stallTimeoutMs ?? defaultStallTimeoutMs ?? 8000;

    // Process rule overrides from spawn config
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
    return this.ptyProcess?.pid;
  }

  get startedAt(): Date | undefined {
    return this._startedAt ?? undefined;
  }

  get lastActivityAt(): Date | undefined {
    return this._lastActivityAt ?? undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Runtime Auto-Response Rules API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add an auto-response rule to this session.
   * Session rules are checked before adapter rules.
   */
  addAutoResponseRule(rule: AutoResponseRule): void {
    // Check for duplicate pattern
    const existingIndex = this.sessionRules.findIndex(
      (r) => r.pattern.source === rule.pattern.source && r.pattern.flags === rule.pattern.flags
    );

    if (existingIndex >= 0) {
      // Replace existing rule with same pattern
      this.sessionRules[existingIndex] = rule;
      this.logger.debug(
        { sessionId: this.id, pattern: rule.pattern.source, type: rule.type },
        'Replaced existing auto-response rule'
      );
    } else {
      this.sessionRules.push(rule);
      this.logger.debug(
        { sessionId: this.id, pattern: rule.pattern.source, type: rule.type },
        'Added auto-response rule'
      );
    }
  }

  /**
   * Remove an auto-response rule by pattern.
   * Returns true if a rule was removed.
   */
  removeAutoResponseRule(pattern: RegExp): boolean {
    const initialLength = this.sessionRules.length;
    this.sessionRules = this.sessionRules.filter(
      (r) => !(r.pattern.source === pattern.source && r.pattern.flags === pattern.flags)
    );

    const removed = this.sessionRules.length < initialLength;
    if (removed) {
      this.logger.debug(
        { sessionId: this.id, pattern: pattern.source },
        'Removed auto-response rule'
      );
    }
    return removed;
  }

  /**
   * Set all session auto-response rules, replacing existing ones.
   */
  setAutoResponseRules(rules: AutoResponseRule[]): void {
    this.sessionRules = [...rules];
    this.logger.debug(
      { sessionId: this.id, count: rules.length },
      'Set auto-response rules'
    );
  }

  /**
   * Get all session auto-response rules.
   */
  getAutoResponseRules(): AutoResponseRule[] {
    return [...this.sessionRules];
  }

  /**
   * Clear all session auto-response rules.
   */
  clearAutoResponseRules(): void {
    this.sessionRules = [];
    this.logger.debug({ sessionId: this.id }, 'Cleared auto-response rules');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Stall Detection
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start or reset the stall detection timer.
   * Active when status is "busy" or "authenticating" and stall detection is enabled.
   *
   * Content-based: hashes the ANSI-stripped buffer tail and only resets the
   * timer when visible content actually changes. This prevents TUI spinners
   * (which produce new ANSI sequences but no new visible text) from endlessly
   * resetting the timer.
   */
  private resetStallTimer(): void {
    if (!this._stallDetectionEnabled || (this._status !== 'busy' && this._status !== 'authenticating')) {
      this.clearStallTimer();
      return;
    }

    // Strip the full buffer FIRST, then slice the tail of the normalized text.
    // Stripping before slicing ensures the 500-char window covers the same
    // visible content regardless of how many raw escape sequences surround it.
    // (Slicing raw first caused different cursor-positioning codes at the
    // truncation boundary to produce different stripped text each TUI redraw.)
    const stripped = this.stripAnsiForStall(this.outputBuffer).trim();
    const tail = stripped.slice(-500);
    const hash = this.simpleHash(tail);

    if (hash === this._lastContentHash) {
      // Content unchanged (e.g., spinner animation) — don't reset the timer
      return;
    }
    this._lastContentHash = hash;

    // Content changed — clear and restart the timer
    if (this._stallTimer) {
      clearTimeout(this._stallTimer);
      this._stallTimer = null;
    }
    this._stallStartedAt = Date.now();
    this._lastStallHash = null; // New content, reset dedup hash for emissions

    this._stallTimer = setTimeout(() => {
      this.onStallTimerFired();
    }, this._stallTimeoutMs);
  }

  /**
   * Clear the stall detection timer.
   */
  private clearStallTimer(): void {
    if (this._stallTimer) {
      clearTimeout(this._stallTimer);
      this._stallTimer = null;
    }
    this._stallStartedAt = null;
    this._lastContentHash = null;
  }

  /**
   * Called when the stall timer fires (no output for stallTimeoutMs).
   */
  private onStallTimerFired(): void {
    if (this._status !== 'busy' && this._status !== 'authenticating') {
      return; // Status changed while timer was running
    }

    // Compute dedup hash from last 500 chars of outputBuffer
    const tail = this.outputBuffer.slice(-500);
    const hash = this.simpleHash(tail);

    if (hash === this._lastStallHash) {
      // Buffer tail unchanged since last stall emission — don't re-emit.
      // Schedule another check.
      this._stallTimer = setTimeout(() => this.onStallTimerFired(), this._stallTimeoutMs);
      return;
    }
    this._lastStallHash = hash;

    // Fast path: try adapter-level task completion detection before
    // falling back to the expensive LLM stall classifier.
    if (this._status === 'busy' && this.adapter.detectTaskComplete?.(this.outputBuffer)) {
      this._status = 'ready';
      this._lastBlockingPromptHash = null;
      this.outputBuffer = '';
      this.clearStallTimer();
      this.emit('status_changed', 'ready');
      this.emit('task_complete');
      this.logger.info(
        { sessionId: this.id },
        'Task complete (adapter fast-path) — agent returned to idle prompt'
      );
      return;
    }

    // Compute recent output: last 2000 chars, ANSI-stripped
    const recentRaw = this.outputBuffer.slice(-2000);
    const recentOutput = this.stripAnsiForStall(recentRaw);

    const stallDurationMs = this._stallStartedAt
      ? Date.now() - this._stallStartedAt
      : this._stallTimeoutMs;

    this.logger.debug(
      { sessionId: this.id, stallDurationMs, bufferTailLength: tail.length },
      'Stall detected'
    );

    this.emit('stall_detected', recentOutput, stallDurationMs);

    // Schedule next check in case classifier says "still_working"
    this._stallTimer = setTimeout(() => this.onStallTimerFired(), this._stallTimeoutMs);
  }

  /**
   * Promise-based delay helper.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simple string hash for deduplication.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  /**
   * Strip ANSI codes, cursor movement, box-drawing, and spinner characters.
   * Used for stall detection hashing and auto-response pattern matching.
   *
   * Cursor movement codes are replaced with spaces (not removed) to preserve
   * word boundaries — e.g. "Do\x1b[5Cyou" becomes "Do you", not "Doyou".
   */
  private stripAnsiForStall(str: string): string {
    // Replace ALL cursor movement/positioning codes with a space to preserve word boundaries:
    // \x1b[nC (forward), \x1b[nD (back), \x1b[nA (up), \x1b[nB (down), \x1b[nG (column)
    // \x1b[n;mH and \x1b[n;mf (absolute positioning)
    // \x1b[nJ (erase display), \x1b[nK (erase line) — also space to keep words apart
    // \x1b[nd (vertical position), \x1b[nE/nF (cursor next/prev line)
    let result = str.replace(/\x1b\[\d*[CDABGdEF]/g, ' ');
    result = result.replace(/\x1b\[\d*(?:;\d+)?[Hf]/g, ' ');
    result = result.replace(/\x1b\[\d*[JK]/g, ' ');

    // Strip remaining ANSI escape sequences (SGR, cursor show/hide, etc.)
    // eslint-disable-next-line no-control-regex
    result = result.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

    // Strip bare control characters (carriage return, backspace, bell, etc.)
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

    // Strip TUI box-drawing, spinner, and decorative Unicode characters
    result = result.replace(/[│╭╰╮╯─═╌║╔╗╚╝╠╣╦╩╬┌┐└┘├┤┬┴┼●○❯❮▶◀⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷✻✶✳✢⏺←→↑↓⬆⬇◆◇▪▫■□▲△▼▽◈⟨⟩⌘⏎⏏⌫⌦⇧⇪⌥]/g, ' ');

    // Normalize countdown/duration text (e.g., "8m 17s" → "0s") to prevent
    // TUI countdown timers from resetting the stall timer every second.
    result = result.replace(/\d+[hms](?:\s+\d+[hms])*/g, '0s');

    // Collapse multiple spaces
    result = result.replace(/ {2,}/g, ' ');

    return result;
  }

  /**
   * Handle external stall classification result.
   * Called by the manager after onStallClassify resolves.
   */
  handleStallClassification(classification: StallClassification | null): void {
    // Guard against async race — session may no longer be busy/authenticating
    if (this._status !== 'busy' && this._status !== 'authenticating') {
      return;
    }

    if (!classification || classification.state === 'still_working') {
      // Force timer restart — classifier said "still working" so we should
      // check again later, even if buffer content hasn't changed.
      this._lastContentHash = null;
      this.resetStallTimer();
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
          this.logger.info(
            { sessionId: this.id, response: classification.suggestedResponse },
            'Auto-responding to stall-classified prompt'
          );
          const resp = classification.suggestedResponse;
          if (resp.startsWith('keys:')) {
            const keys = resp.slice(5).split(',').map(k => k.trim());
            this.sendKeySequence(keys);
          } else {
            this.writeRaw(resp + '\r');
          }
          this.emit('blocking_prompt', promptInfo, true);
          this.outputBuffer = ''; // Prevent stale text from triggering false detections
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
        this.logger.info({ sessionId: this.id }, 'Stall classified as task_complete, transitioning to ready');
        break;

      case 'error':
        this.clearStallTimer();
        this.emit('error', new Error(classification.prompt || 'Stall classified as error'));
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Task Completion Detection
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Schedule a task_complete transition after a debounce period.
   * If new non-whitespace output arrives before the timer fires,
   * the timer is cancelled (by cancelTaskComplete in onData).
   */
  private scheduleTaskComplete(): void {
    // Already scheduled — let the existing timer run
    if (this._taskCompleteTimer) return;

    this._taskCompleteTimer = setTimeout(() => {
      this._taskCompleteTimer = null;

      // Re-check: still busy and ready indicator still present?
      if (this._status !== 'busy') return;
      if (!this.adapter.detectReady(this.outputBuffer)) return;

      this._status = 'ready';
      this._lastBlockingPromptHash = null;
      this.outputBuffer = '';
      this.clearStallTimer();
      this.emit('status_changed', 'ready');
      this.emit('task_complete');
      this.logger.info({ sessionId: this.id }, 'Task complete — agent returned to idle prompt');
    }, PTYSession.TASK_COMPLETE_DEBOUNCE_MS);
  }

  /**
   * Cancel a pending task_complete timer (new output arrived that
   * doesn't match the idle prompt, so the agent is still working).
   */
  private cancelTaskComplete(): void {
    if (this._taskCompleteTimer) {
      clearTimeout(this._taskCompleteTimer);
      this._taskCompleteTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Ready Detection Settle Delay
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Schedule or reset the ready-settle timer.
   * Defers emitting session_ready until output goes quiet for readySettleMs
   * after detectReady first matches. This prevents sending input while
   * TUI agents are still rendering (status bar, shortcuts, update notices).
   */
  private scheduleReadySettle(): void {
    this._readySettlePending = true;
    if (this._readySettleTimer) {
      clearTimeout(this._readySettleTimer);
    }
    const settleMs = this.adapter.readySettleMs ?? 100;
    this._readySettleTimer = setTimeout(() => {
      this._readySettleTimer = null;
      this._readySettlePending = false;
      // Re-verify state and ready indicator
      if (this._status !== 'starting' && this._status !== 'authenticating') return;
      if (!this.adapter.detectReady(this.outputBuffer)) return;
      this._status = 'ready';
      this._lastBlockingPromptHash = null;
      this.outputBuffer = '';
      this.clearStallTimer();
      this.emit('ready');
      this.logger.info({ sessionId: this.id }, 'Session ready (after settle)');
    }, settleMs);
  }

  /**
   * Cancel a pending ready-settle timer (ready indicator disappeared
   * or session status changed).
   */
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

  /**
   * Start the PTY session
   */
  async start(): Promise<void> {
    if (this.ptyProcess) {
      throw new Error('Session already started');
    }

    const nodePty = loadPty();

    this._status = 'starting';
    this._startedAt = new Date();

    const command = this.adapter.getCommand();
    const args = this.adapter.getArgs(this.config);
    const adapterEnv = this.adapter.getEnv(this.config);

    const env = {
      ...process.env,
      ...adapterEnv,
      ...this.config.env,
      // Force terminal settings
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    this.logger.info(
      { sessionId: this.id, command, args: args.join(' ') },
      'Starting PTY session'
    );

    try {
      this.ptyProcess = nodePty.spawn(command, args, {
        name: 'xterm-256color',
        cols: this.config.cols || 120,
        rows: this.config.rows || 40,
        cwd: this.config.workdir || process.cwd(),
        env: env as Record<string, string>,
      });

      this.setupEventHandlers();

      this.logger.info(
        { sessionId: this.id, pid: this.ptyProcess.pid },
        'PTY session started'
      );
    } catch (error) {
      this._status = 'error';
      this.logger.error(
        { sessionId: this.id, error },
        'Failed to start PTY session'
      );
      throw error;
    }
  }

  /**
   * Set up event handlers for the PTY
   */
  private setupEventHandlers(): void {
    if (!this.ptyProcess) return;

    this.ptyProcess.onData((data) => {
      this._lastActivityAt = new Date();
      this.outputBuffer += data;

      // Cap the buffer to prevent unbounded growth during long tasks.
      // Detection only ever inspects the tail, so trimming is safe.
      if (this.outputBuffer.length > PTYSession.MAX_OUTPUT_BUFFER) {
        this.outputBuffer = this.outputBuffer.slice(-PTYSession.MAX_OUTPUT_BUFFER);
      }

      // Emit raw output immediately (callers may need it for real-time display)
      this.emit('output', data);

      // Defer all heavy detection work to the next event-loop tick.
      // node-pty delivers data synchronously from its native read loop;
      // running regex-heavy detection inline can starve the event loop
      // and prevent timers (stall detection, task_complete debounce)
      // from firing — especially on macOS ARM64 where the PTY read can
      // hold the libuv poll phase.
      if (!this._processScheduled) {
        this._processScheduled = true;
        setImmediate(() => {
          this._processScheduled = false;
          this.processOutputBuffer();
        });
      }
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      this._status = 'stopped';
      this.clearStallTimer();
      this.logger.info(
        { sessionId: this.id, exitCode, signal },
        'PTY session exited'
      );
      this.emit('exit', exitCode);
    });
  }

  /**
   * Process the accumulated output buffer.
   * Called via setImmediate() from the onData handler so that heavy regex
   * work runs in its own event-loop tick, not inside node-pty's native callback.
   */
  private processOutputBuffer(): void {
    // Reset stall timer on any new output while busy or authenticating
    if (this._status === 'busy' || this._status === 'authenticating') {
      this.resetStallTimer();
    }

    // If a ready-settle is pending, reset the timer on new data instead of
    // re-running all detection. If the ready indicator disappears, cancel.
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

    // Ready detection — check FIRST, before blocking prompt detection.
    // After an auto-response (e.g. trust prompt), the buffer may contain
    // leftover prompt text that would falsely trigger detectBlockingPrompt
    // and block detectReady from ever running. Adapter detectReady
    // implementations have negative guards for trust/auth prompts, so
    // this is safe — it won't prematurely mark the session as ready.
    if (
      (this._status === 'starting' || this._status === 'authenticating') &&
      this.adapter.detectReady(this.outputBuffer)
    ) {
      this.scheduleReadySettle();
      return;
    }

    // Task completion detection — when busy and the agent returns to its idle prompt.
    // Uses a debounce to avoid false positives during mid-task output that
    // happens to contain the prompt string.
    if (this._status === 'busy' && this.adapter.detectReady(this.outputBuffer)) {
      this.scheduleTaskComplete();
    } else {
      this.cancelTaskComplete();
    }

    // Auto-response / blocking prompt detection — runs after detectReady.
    // Handles trust confirmations, permission prompts, apply changes, etc.
    // throughout the entire session lifecycle.
    const blockingPrompt = this.detectAndHandleBlockingPrompt();
    if (blockingPrompt) {
      return;
    }

    // Login detection — only during startup/auth (not after ready/busy)
    if (this._status !== 'ready' && this._status !== 'busy') {
      const loginDetection = this.adapter.detectLogin(this.outputBuffer);
      if (loginDetection.required && this._status !== 'authenticating') {
        this._status = 'authenticating';
        this.clearStallTimer();
        this.emit('login_required', loginDetection.instructions, loginDetection.url);
        this.logger.warn(
          { sessionId: this.id, loginType: loginDetection.type },
          'Login required'
        );
        return;
      }
    }

    // Check for exit
    const exitDetection = this.adapter.detectExit(this.outputBuffer);
    if (exitDetection.exited) {
      this._status = 'stopped';
      this.clearStallTimer();
      this.emit('exit', exitDetection.code || 0);
    }

    // Try to parse output into structured message
    // Only parse once session is ready - during startup we need the buffer
    // to accumulate so detectReady can see the full startup output
    if (this._status !== 'starting' && this._status !== 'authenticating') {
      this.tryParseOutput();
    }
  }

  /**
   * Detect blocking prompts and handle them with auto-responses or user notification.
   * Deduplicates emissions - won't re-emit the same blocking prompt repeatedly.
   */
  private detectAndHandleBlockingPrompt(): boolean {
    // First, check adapter's auto-response rules
    const autoHandled = this.tryAutoResponse();
    if (autoHandled) {
      return true;
    }

    // Then check the adapter's detectBlockingPrompt method
    if (this.adapter.detectBlockingPrompt) {
      const detection = this.adapter.detectBlockingPrompt(this.outputBuffer);

      if (detection.detected) {
        // Deduplicate: don't re-emit the same blocking prompt
        const promptHash = `${detection.type}:${detection.prompt || ''}`;
        if (promptHash === this._lastBlockingPromptHash) {
          // Still blocked by same prompt, but don't spam events
          return true;
        }
        this._lastBlockingPromptHash = promptHash;

        const promptInfo: BlockingPromptInfo = {
          type: detection.type || 'unknown',
          prompt: detection.prompt,
          options: detection.options,
          canAutoRespond: detection.canAutoRespond || false,
          instructions: detection.instructions,
          url: detection.url,
        };

        // If we can auto-respond and have a suggested response, do it
        if (detection.canAutoRespond && detection.suggestedResponse) {
          this.logger.info(
            {
              sessionId: this.id,
              promptType: detection.type,
              response: detection.suggestedResponse,
            },
            'Auto-responding to blocking prompt'
          );

          const resp = detection.suggestedResponse;
          if (resp.startsWith('keys:')) {
            const keys = resp.slice(5).split(',').map(k => k.trim());
            this.sendKeySequence(keys);
          } else {
            this.writeRaw(resp + '\r');
          }
          this._lastBlockingPromptHash = null; // Clear after auto-response
          this.outputBuffer = ''; // Prevent stale text from triggering false detections
          this.emit('blocking_prompt', promptInfo, true);
          return true;
        }

        // Otherwise, notify that user intervention is needed
        if (detection.type === 'login') {
          this._status = 'authenticating';
        }

        this.logger.warn(
          {
            sessionId: this.id,
            promptType: detection.type,
            prompt: detection.prompt,
          },
          'Blocking prompt requires user intervention'
        );

        this.emit('blocking_prompt', promptInfo, false);
        return true;
      } else {
        // No blocking prompt detected - clear the hash
        this._lastBlockingPromptHash = null;
      }
    }

    return false;
  }

  /**
   * Try to match and apply auto-response rules.
   * Session rules are checked first, then adapter rules.
   */
  private tryAutoResponse(): boolean {
    // Combine session rules (higher priority) with adapter rules (filtered/merged by overrides)
    const adapterRules = (this.adapter.autoResponseRules || [])
      .filter(r => !this._disabledRulePatterns.has(r.pattern.source))
      .map(r => {
        const override = this._ruleOverrides.get(r.pattern.source);
        return override ? { ...r, ...override } : r;
      });
    const allRules = [...this.sessionRules, ...adapterRules];

    if (allRules.length === 0) {
      return false;
    }

    // Strip ANSI codes, cursor movement, box-drawing, and spinner chars
    // so regex patterns match the visible text, not raw terminal sequences.
    const stripped = this.stripAnsiForStall(this.outputBuffer);

    for (const rule of allRules) {
      // Skip once-rules that have already fired
      if (rule.once) {
        const ruleKey = `${rule.pattern.source}:${rule.pattern.flags}`;
        if (this._firedOnceRules.has(ruleKey)) {
          continue;
        }
      }

      if (rule.pattern.test(stripped)) {
        // Check if it's safe to auto-respond (default: true)
        const safe = rule.safe !== false;
        const isSessionRule = this.sessionRules.includes(rule);

        if (safe) {
          this.logger.info(
            {
              sessionId: this.id,
              promptType: rule.type,
              description: rule.description,
              response: rule.response,
              source: isSessionRule ? 'session' : 'adapter',
            },
            'Applying auto-response rule'
          );

          // Determine how to send the response
          const useKeys = rule.keys && rule.keys.length > 0;
          const isTuiDefault = !rule.responseType && !rule.keys && this.adapter.usesTuiMenus;

          if (useKeys) {
            // Explicit key sequence
            this.sendKeySequence(rule.keys!);
          } else if (isTuiDefault) {
            // TUI adapter with no explicit responseType — default to Enter
            this.sendKeys('enter');
          } else {
            // Text response (backward compat)
            this.writeRaw(rule.response + '\r');
          }

          // Track once-rules so they don't fire again on TUI re-renders
          if (rule.once) {
            const ruleKey = `${rule.pattern.source}:${rule.pattern.flags}`;
            this._firedOnceRules.add(ruleKey);
          }

          // Clear the entire buffer — the prompt has been handled and leftover
          // text (e.g. "Press enter to continue") would block detectReady().
          this.outputBuffer = '';

          const promptInfo: BlockingPromptInfo = {
            type: rule.type,
            prompt: rule.description,
            canAutoRespond: true,
          };

          this.emit('blocking_prompt', promptInfo, true);
          return true;
        } else {
          // Not safe to auto-respond, emit for user intervention
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

  /**
   * Try to parse the output buffer into structured messages
   */
  private tryParseOutput(): void {
    const parsed = this.adapter.parseOutput(this.outputBuffer);

    if (parsed && parsed.isComplete) {
      // Clear the buffer for the parsed content
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

      // Also emit specific event for questions
      if (parsed.isQuestion) {
        this.emit('question', parsed.content);
      }
    }
  }

  /**
   * Write data to the PTY (formatted by adapter)
   */
  write(data: string): void {
    if (!this.ptyProcess) {
      throw new Error('Session not started');
    }

    this._lastActivityAt = new Date();
    const formatted = this.adapter.formatInput(data);
    this.ptyProcess.write(formatted + '\r');

    this.logger.debug({ sessionId: this.id, input: data }, 'Sent input to session');
  }

  /**
   * Write raw data directly to the PTY (no formatting)
   */
  writeRaw(data: string): void {
    if (!this.ptyProcess) {
      throw new Error('Session not started');
    }

    this._lastActivityAt = new Date();
    this.ptyProcess.write(data);
  }

  /**
   * Send a task/message to the session
   *
   * Text and Enter are sent as separate writes with a small delay.
   * This is required for TUI-based CLIs (Gemini CLI, ink/React-based tools)
   * which drop the trailing \r if it arrives in the same write buffer
   * during a render cycle.
   */
  send(message: string): SessionMessage {
    this._status = 'busy';
    this.emit('status_changed', 'busy');
    this.resetStallTimer();

    const msg: SessionMessage = {
      id: `${this.id}-msg-${++this.messageCounter}`,
      sessionId: this.id,
      direction: 'inbound',
      type: 'task',
      content: message,
      timestamp: new Date(),
    };

    // Write formatted text without Enter
    const formatted = this.adapter.formatInput(message);
    this.writeRaw(formatted);

    // Send Enter separately after a brief delay
    // TUI-based CLIs need this as a discrete event to register the submission
    setTimeout(() => this.sendKeys('enter'), 50);

    this.logger.debug({ sessionId: this.id, input: message }, 'Sent input to session');

    return msg;
  }

  /**
   * Resize the PTY terminal
   */
  resize(cols: number, rows: number): void {
    this.ptyProcess?.resize(cols, rows);
  }

  /**
   * Send special keys to the PTY
   *
   * Supported keys:
   * - Control: ctrl+c, ctrl+d, ctrl+z, ctrl+l, ctrl+a, ctrl+e, ctrl+k, ctrl+u, ctrl+w, ctrl+r
   * - Navigation: up, down, left, right, home, end, pageup, pagedown
   * - Editing: enter, tab, backspace, delete, insert, escape
   * - Function: f1-f12
   *
   * @param keys - Key name(s) to send, e.g. "ctrl+c" or ["up", "up", "enter"]
   */
  sendKeys(keys: string | string[]): void {
    if (!this.ptyProcess) {
      throw new Error('Session not started');
    }

    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const key of keyList) {
      const normalizedKey = key.toLowerCase().trim();
      const sequence = SPECIAL_KEYS[normalizedKey];

      if (sequence) {
        this._lastActivityAt = new Date();
        this.ptyProcess.write(sequence);
        this.logger.debug({ sessionId: this.id, key: normalizedKey }, 'Sent special key');
      } else {
        this.logger.warn(
          { sessionId: this.id, key: normalizedKey },
          'Unknown special key, sending as literal'
        );
        this.ptyProcess.write(key);
      }
    }
  }

  /**
   * Select a TUI menu option by index (0-based).
   * Sends Down arrow `optionIndex` times, then Enter, with 50ms delays.
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
   * Each key is sent 50ms apart using setTimeout to keep the caller synchronous.
   */
  private sendKeySequence(keys: string[]): void {
    keys.forEach((key, i) => {
      setTimeout(() => this.sendKeys(key), i * 50);
    });
  }

  /**
   * Paste text using bracketed paste mode
   *
   * Bracketed paste mode wraps the pasted text in escape sequences
   * that tell the terminal this is pasted content, not typed input.
   * This prevents issues with pasting text that contains special characters
   * or looks like commands.
   *
   * @param text - Text to paste
   * @param useBracketedPaste - Whether to use bracketed paste mode (default: true)
   */
  paste(text: string, useBracketedPaste: boolean = true): void {
    if (!this.ptyProcess) {
      throw new Error('Session not started');
    }

    this._lastActivityAt = new Date();

    if (useBracketedPaste) {
      this.ptyProcess.write(BRACKETED_PASTE_START + text + BRACKETED_PASTE_END);
      this.logger.debug(
        { sessionId: this.id, length: text.length },
        'Pasted text with bracketed paste mode'
      );
    } else {
      this.ptyProcess.write(text);
      this.logger.debug(
        { sessionId: this.id, length: text.length },
        'Pasted text without bracketed paste'
      );
    }
  }

  /**
   * Kill the PTY process
   */
  kill(signal?: string): void {
    if (this.ptyProcess) {
      this._status = 'stopping';
      this.clearStallTimer();
      this.cancelTaskComplete();
      this.cancelReadySettle();
      this.ptyProcess.kill(signal);
      this.logger.info({ sessionId: this.id, signal }, 'Killing PTY session');
    }
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
    };
  }
}
