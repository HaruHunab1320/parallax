/**
 * Terminal Renderer for 5" LCD
 *
 * Manages the tmux session that drives the Pi's 5" Waveshare display.
 * The coding agent runs inside a tmux pane, and we overlay a status bar
 * at the top showing agent identity and thread state.
 *
 * Display layout (800x480 at Terminus 16x32 = ~50 cols x 15 rows):
 * ┌────────────────────────────────────────────────┐
 * │ [CLAUDE] Vero                      RUNNING     │ ← tmux status bar
 * │                                                │
 * │  $ claude                                      │
 * │  > Analyzing task...                           │ ← coding agent output
 * │  > Creating files...                           │
 * │  ...                                           │
 * │                                                │
 * └────────────────────────────────────────────────┘
 */

import { execSync, spawnSync } from 'child_process';
import type { Logger } from 'pino';

export interface TerminalRendererConfig {
  /** Agent display name */
  agentName: string;
  /** Agent type (claude, codex, gemini) */
  agentType: string;
  /** Tmux session name to configure */
  tmuxSession: string;
}

export class TerminalRenderer {
  private configured = false;

  constructor(
    private readonly config: TerminalRendererConfig,
    private readonly logger: Logger
  ) {}

  /**
   * Configure tmux status bar for this agent.
   * Shows agent identity on the left and thread status on the right.
   */
  configure(): void {
    if (!this.tmuxSessionExists()) {
      this.logger.debug(
        { session: this.config.tmuxSession },
        'Tmux session not found — status bar will be configured when session appears'
      );
      return;
    }

    const { agentType } = this.config;

    try {
      // Status bar: top position
      this.tmuxSet('status', 'on');
      this.tmuxSet('status-position', 'top');
      this.tmuxSet('status-interval', '2');

      // Left side: agent identity with type badge
      const typeLabel = agentType.toUpperCase();
      const typeBadge = this.agentTypeBadge(agentType);
      this.tmuxSet('status-left', ` ${typeBadge} [${typeLabel}] ${this.config.agentName} `);
      this.tmuxSet('status-left-length', '45');
      this.tmuxSet('status-left-style', this.agentTypeStyle(agentType));

      // Right side: status (updated dynamically)
      this.tmuxSet('status-right', ' READY ');
      this.tmuxSet('status-right-length', '30');
      this.tmuxSet('status-right-style', 'fg=black,bg=cyan');

      // Status bar background
      this.tmuxSet('status-style', 'fg=white,bg=colour235');

      // Enable mouse (for capacitive touchscreen)
      this.tmuxSet('mouse', 'on');

      // Large scrollback for coding sessions
      this.tmuxSet('history-limit', '50000');

      this.configured = true;
      this.logger.info(
        { session: this.config.tmuxSession, agentType },
        'Terminal display configured'
      );
    } catch (error) {
      this.logger.warn({ error }, 'Failed to configure tmux status bar');
    }
  }

  /**
   * Update the status display on the right side of the tmux status bar.
   */
  updateStatus(status: string, _summary?: string): void {
    if (!this.configured && this.tmuxSessionExists()) {
      this.configure();
    }
    if (!this.configured) return;

    const label = this.statusToLabel(status);
    const style = this.statusToStyle(status);

    try {
      this.tmuxSet('status-right', ` ${label} `);
      this.tmuxSet('status-right-style', style);
    } catch {
      // tmux session may have been destroyed
      this.configured = false;
    }
  }

  /**
   * Show a boot splash message in the tmux pane.
   * Called before the coding agent starts.
   */
  showBootSplash(): void {
    if (!this.tmuxSessionExists()) return;

    const { agentName, agentType } = this.config;
    const typeLabel = agentType.toUpperCase();

    const splash = [
      '',
      `  ╔═══════════════════════════════════════╗`,
      `  ║                                       ║`,
      `  ║       P A R A L L A X                  ║`,
      `  ║       Coding Swarm Agent               ║`,
      `  ║                                       ║`,
      `  ║  Agent:  ${agentName.padEnd(28)}  ║`,
      `  ║  Type:   ${typeLabel.padEnd(28)}  ║`,
      `  ║                                       ║`,
      `  ║  Connecting to control plane...        ║`,
      `  ║                                       ║`,
      `  ╚═══════════════════════════════════════╝`,
      '',
    ];

    try {
      for (const line of splash) {
        this.tmuxSendKeys(`echo '${line.replace(/'/g, "'\\''")}'`);
      }
      this.tmuxSendKeys('');
    } catch {
      // Best effort
    }
  }

  /**
   * Clear the tmux pane (e.g., before starting a new thread).
   */
  clear(): void {
    if (!this.tmuxSessionExists()) return;
    try {
      execSync(`tmux send-keys -t ${this.config.tmuxSession} C-l`, { stdio: 'pipe' });
    } catch {
      // Best effort
    }
  }

  // ─── Agent type styling ───

  private agentTypeBadge(agentType: string): string {
    switch (agentType) {
      case 'claude': return '◆';
      case 'codex': return '●';
      case 'gemini': return '★';
      default: return '▸';
    }
  }

  private agentTypeStyle(agentType: string): string {
    switch (agentType) {
      case 'claude': return 'fg=white,bg=colour166,bold';  // Orange
      case 'codex': return 'fg=white,bg=colour28,bold';    // Green
      case 'gemini': return 'fg=white,bg=colour33,bold';   // Blue
      default: return 'fg=black,bg=green,bold';
    }
  }

  // ─── Status display ───

  private statusToLabel(status: string): string {
    switch (status) {
      case 'starting': return '◌ STARTING...';
      case 'running': return '● RUNNING';
      case 'blocked': return '▲ BLOCKED';
      case 'prompt_ready': return '◆ READY';
      case 'completed': return '✓ DONE';
      case 'failed': return '✗ FAILED';
      default: return status.toUpperCase();
    }
  }

  private statusToStyle(status: string): string {
    switch (status) {
      case 'starting': return 'fg=black,bg=yellow';
      case 'running': return 'fg=black,bg=green';
      case 'blocked': return 'fg=black,bg=yellow,bold';
      case 'prompt_ready': return 'fg=black,bg=cyan';
      case 'completed': return 'fg=black,bg=cyan,bold';
      case 'failed': return 'fg=white,bg=red,bold';
      default: return 'fg=black,bg=cyan';
    }
  }

  // ─── Tmux helpers ───

  private tmuxSessionExists(): boolean {
    const result = spawnSync('tmux', ['has-session', '-t', this.config.tmuxSession], {
      stdio: 'pipe',
    });
    return result.status === 0;
  }

  private tmuxSet(option: string, value: string): void {
    execSync(
      `tmux set-option -t ${this.config.tmuxSession} ${option} "${value}"`,
      { stdio: 'pipe' }
    );
  }

  private tmuxSendKeys(command: string): void {
    execSync(
      `tmux send-keys -t ${this.config.tmuxSession} "${command}" Enter`,
      { stdio: 'pipe' }
    );
  }
}
