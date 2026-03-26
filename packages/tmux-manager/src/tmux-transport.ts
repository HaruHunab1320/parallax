/**
 * Tmux Transport Layer
 *
 * Low-level interface to tmux sessions via the tmux CLI.
 * Replaces node-pty as the PTY backend — no native addons required.
 */

import { execSync } from 'child_process';
import { ensureTmux } from './ensure-tmux.js';

export interface TmuxSpawnOptions {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
  historyLimit: number;
}

export interface TmuxCaptureOptions {
  /** Include ANSI escape codes (default: false) */
  ansi?: boolean;
  /** Number of lines from scrollback to include (default: visible only) */
  scrollback?: number;
}

/**
 * Mapping from our SPECIAL_KEYS names to tmux send-keys key names.
 */
export const TMUX_KEY_MAP: Record<string, string> = {
  'enter': 'Enter',
  'return': 'Enter',
  'tab': 'Tab',
  'escape': 'Escape',
  'esc': 'Escape',
  'space': 'Space',
  'backspace': 'BSpace',
  'delete': 'DC',
  'insert': 'IC',
  'up': 'Up',
  'down': 'Down',
  'left': 'Left',
  'right': 'Right',
  'home': 'Home',
  'end': 'End',
  'pageup': 'PageUp',
  'pagedown': 'PageDown',
  'f1': 'F1',
  'f2': 'F2',
  'f3': 'F3',
  'f4': 'F4',
  'f5': 'F5',
  'f6': 'F6',
  'f7': 'F7',
  'f8': 'F8',
  'f9': 'F9',
  'f10': 'F10',
  'f11': 'F11',
  'f12': 'F12',
  // Ctrl keys map to tmux C- prefix
  'ctrl+a': 'C-a', 'ctrl+b': 'C-b', 'ctrl+c': 'C-c', 'ctrl+d': 'C-d',
  'ctrl+e': 'C-e', 'ctrl+f': 'C-f', 'ctrl+g': 'C-g', 'ctrl+h': 'C-h',
  'ctrl+i': 'C-i', 'ctrl+j': 'C-j', 'ctrl+k': 'C-k', 'ctrl+l': 'C-l',
  'ctrl+m': 'C-m', 'ctrl+n': 'C-n', 'ctrl+o': 'C-o', 'ctrl+p': 'C-p',
  'ctrl+q': 'C-q', 'ctrl+r': 'C-r', 'ctrl+s': 'C-s', 'ctrl+t': 'C-t',
  'ctrl+u': 'C-u', 'ctrl+v': 'C-v', 'ctrl+w': 'C-w', 'ctrl+x': 'C-x',
  'ctrl+y': 'C-y', 'ctrl+z': 'C-z',
  // Shift combinations
  'shift+up': 'S-Up', 'shift+down': 'S-Down',
  'shift+left': 'S-Left', 'shift+right': 'S-Right',
  'shift+tab': 'BTab',
};

/**
 * Low-level tmux session transport.
 * Manages tmux sessions via CLI commands.
 */
export class TmuxTransport {
  private pollingTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private lastCapture: Map<string, string> = new Map();

  constructor() {
    // No setup needed — tmux is a system binary
  }

  /**
   * Spawn a new tmux session running the given command.
   */
  spawn(sessionName: string, options: TmuxSpawnOptions): void {
    ensureTmux();

    // Build the full command string
    const fullCommand = [options.command, ...options.args].join(' ');

    // Build environment exports to prepend
    const envExports = Object.entries(options.env)
      .map(([k, v]) => `export ${k}=${this.shellEscape(v)}`)
      .join('; ');
    const shellCommand = envExports
      ? `${envExports}; exec ${fullCommand}`
      : `exec ${fullCommand}`;

    // Create detached session with specified dimensions
    execSync(
      `tmux new-session -d -s ${this.shellEscape(sessionName)} ` +
      `-x ${options.cols} -y ${options.rows} ` +
      `-c ${this.shellEscape(options.cwd)} ` +
      `${this.shellEscape(shellCommand)}`,
      { stdio: 'pipe', timeout: 10000 }
    );

    // Configure session options
    this.tmuxExec(`set-option -t ${this.shellEscape(sessionName)} history-limit ${options.historyLimit}`);
    this.tmuxExec(`set-option -t ${this.shellEscape(sessionName)} remain-on-exit on`);
  }

  /**
   * Check if a tmux session exists and is alive.
   */
  isAlive(sessionName: string): boolean {
    try {
      execSync(`tmux has-session -t ${this.shellEscape(sessionName)}`, {
        stdio: 'pipe',
        timeout: 3000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Kill a tmux session.
   */
  kill(sessionName: string): void {
    this.stopOutputStreaming(sessionName);
    try {
      this.tmuxExec(`kill-session -t ${this.shellEscape(sessionName)}`);
    } catch {
      // Session may already be dead
    }
  }

  /**
   * Send a signal to the process in the tmux pane.
   */
  signal(sessionName: string, sig: string): void {
    // Get the pane PID and send signal via kill
    try {
      const pid = this.getPanePid(sessionName);
      if (pid) {
        const nodeSignal = sig === 'SIGKILL' ? '-9' : sig === 'SIGTERM' ? '-15' : `-${sig}`;
        execSync(`kill ${nodeSignal} ${pid}`, { stdio: 'pipe', timeout: 3000 });
      }
    } catch {
      // Process may already be dead
    }
  }

  /**
   * Send literal text to the tmux session (no key interpretation).
   */
  sendText(sessionName: string, text: string): void {
    // For large texts, use load-buffer + paste-buffer to avoid E2BIG
    // (shell argument size limit ~128KB on Linux)
    if (text.length > 50000) {
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const tmpFile = path.join(os.tmpdir(), `tmux-paste-${Date.now()}.txt`);
      try {
        fs.writeFileSync(tmpFile, text);
        this.tmuxExec(`load-buffer ${this.shellEscape(tmpFile)}`);
        this.tmuxExec(`paste-buffer -t ${this.shellEscape(sessionName)}`);
      } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      }
    } else {
      this.tmuxExec(`send-keys -t ${this.shellEscape(sessionName)} -l ${this.shellEscape(text)}`);
    }
  }

  /**
   * Send a named key to the tmux session.
   * Uses TMUX_KEY_MAP for translation from our key names.
   */
  sendKey(sessionName: string, key: string): void {
    const tmuxKey = TMUX_KEY_MAP[key.toLowerCase()];
    if (tmuxKey) {
      this.tmuxExec(`send-keys -t ${this.shellEscape(sessionName)} ${tmuxKey}`);
    } else {
      // Try sending as literal text
      this.tmuxExec(`send-keys -t ${this.shellEscape(sessionName)} -l ${this.shellEscape(key)}`);
    }
  }

  /**
   * Capture the current pane content.
   */
  capturePane(sessionName: string, options: TmuxCaptureOptions = {}): string {
    const flags = ['-p']; // Print to stdout
    if (options.ansi) {
      flags.push('-e'); // Include escape sequences
    }
    if (options.scrollback !== undefined) {
      flags.push(`-S -${options.scrollback}`);
    }

    try {
      return execSync(
        `tmux capture-pane -t ${this.shellEscape(sessionName)} ${flags.join(' ')}`,
        { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch {
      return '';
    }
  }

  /**
   * Start polling output from a tmux session via capture-pane.
   * Polls at the given interval and calls the callback with new/changed content.
   *
   * Uses capture-pane with ANSI codes (-e) and scrollback for full fidelity.
   * Compares against last capture to detect changes and emit only new data.
   */
  startOutputStreaming(
    sessionName: string,
    callback: (data: string) => void,
    pollIntervalMs: number = 100,
  ): void {
    this.lastCapture.set(sessionName, '');

    const timer = setInterval(() => {
      try {
        const current = this.capturePane(sessionName, { ansi: true, scrollback: 500 });
        const last = this.lastCapture.get(sessionName) || '';

        if (current !== last) {
          this.lastCapture.set(sessionName, current);

          // Find the new content by comparing with previous capture
          if (current.startsWith(last)) {
            // Common case: new content appended
            const newData = current.slice(last.length);
            if (newData) callback(newData);
          } else {
            // Screen was redrawn (TUI, clear, etc.) — emit full content
            callback(current);
          }
        }
      } catch {
        // Session may have died
      }
    }, pollIntervalMs);

    this.pollingTimers.set(sessionName, timer);
  }

  /**
   * Stop polling output from a tmux session.
   */
  stopOutputStreaming(sessionName: string): void {
    const timer = this.pollingTimers.get(sessionName);
    if (timer) {
      clearInterval(timer);
      this.pollingTimers.delete(sessionName);
    }
    this.lastCapture.delete(sessionName);
  }

  /**
   * Get the PID of the process running in the tmux pane.
   */
  getPanePid(sessionName: string): number | undefined {
    try {
      const output = execSync(
        `tmux display-message -t ${this.shellEscape(sessionName)} -p '#{pane_pid}'`,
        { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      const pid = parseInt(output, 10);
      return isNaN(pid) ? undefined : pid;
    } catch {
      return undefined;
    }
  }

  /**
   * Get the pane dimensions.
   */
  getPaneDimensions(sessionName: string): { cols: number; rows: number } {
    try {
      const output = execSync(
        `tmux display-message -t ${this.shellEscape(sessionName)} -p '#{pane_width}x#{pane_height}'`,
        { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      const [cols, rows] = output.split('x').map(Number);
      return { cols: cols || 120, rows: rows || 40 };
    } catch {
      return { cols: 120, rows: 40 };
    }
  }

  /**
   * Resize a tmux session window.
   */
  resize(sessionName: string, cols: number, rows: number): void {
    try {
      this.tmuxExec(`resize-window -t ${this.shellEscape(sessionName)} -x ${cols} -y ${rows}`);
    } catch {
      // May fail if window doesn't exist
    }
  }

  /**
   * Check if the pane's process has exited.
   * Uses remain-on-exit to detect dead panes.
   */
  isPaneAlive(sessionName: string): boolean {
    try {
      const output = execSync(
        `tmux display-message -t ${this.shellEscape(sessionName)} -p '#{pane_dead}'`,
        { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      return output !== '1';
    } catch {
      return false;
    }
  }

  /**
   * Get the exit status of a dead pane.
   */
  getPaneExitStatus(sessionName: string): number | undefined {
    try {
      const output = execSync(
        `tmux display-message -t ${this.shellEscape(sessionName)} -p '#{pane_dead_status}'`,
        { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      const code = parseInt(output, 10);
      return isNaN(code) ? undefined : code;
    } catch {
      return undefined;
    }
  }

  /**
   * List all tmux sessions matching a prefix.
   */
  static listSessions(prefix?: string): Array<{ name: string; created: string; attached: boolean }> {
    try {
      const output = execSync(
        `tmux list-sessions -F '#{session_name}|#{session_created}|#{session_attached}'`,
        { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      if (!output) return [];

      return output.split('\n')
        .map(line => {
          const [name, created, attached] = line.split('|');
          return { name, created, attached: attached === '1' };
        })
        .filter(s => !prefix || s.name.startsWith(prefix));
    } catch {
      return [];
    }
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    for (const [, timer] of this.pollingTimers) {
      clearInterval(timer);
    }
    this.pollingTimers.clear();
    this.lastCapture.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private tmuxExec(args: string): void {
    execSync(`tmux ${args}`, { stdio: 'pipe', timeout: 5000 });
  }

  private shellEscape(str: string): string {
    // Wrap in single quotes and escape any embedded single quotes
    return `'${str.replace(/'/g, "'\\''")}'`;
  }
}
