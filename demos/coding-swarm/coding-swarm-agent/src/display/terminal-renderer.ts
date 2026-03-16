/**
 * Terminal Renderer for 5" LCD
 *
 * Configures tmux status bar overlays for agent identity and thread status.
 * The actual terminal output is rendered naturally by tmux on the Pi's display.
 */

import { execSync } from 'child_process';
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
  constructor(
    private readonly config: TerminalRendererConfig,
    private readonly logger: Logger
  ) {}

  /**
   * Configure tmux status bar for this agent.
   * Shows agent identity on the left and thread status on the right.
   */
  configure(): void {
    const { tmuxSession, agentName, agentType } = this.config;

    try {
      // Status bar styling
      this.tmuxSet('status', 'on');
      this.tmuxSet('status-position', 'top');
      this.tmuxSet('status-interval', '2');

      // Left side: agent identity
      const typeLabel = agentType.toUpperCase();
      this.tmuxSet('status-left', ` [${typeLabel}] ${agentName} `);
      this.tmuxSet('status-left-length', '40');
      this.tmuxSet('status-left-style', 'fg=black,bg=green,bold');

      // Right side: status (updated dynamically)
      this.tmuxSet('status-right', ' READY ');
      this.tmuxSet('status-right-length', '30');
      this.tmuxSet('status-right-style', 'fg=black,bg=cyan');

      // Status bar background
      this.tmuxSet('status-style', 'fg=white,bg=colour235');

      this.logger.info({ tmuxSession, agentType }, 'Terminal display configured');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to configure tmux status bar');
    }
  }

  /**
   * Update the status display on the right side of the tmux status bar.
   */
  updateStatus(status: string, _summary?: string): void {
    const label = this.statusToLabel(status);
    const style = this.statusToStyle(status);

    try {
      this.tmuxSet('status-right', ` ${label} `);
      this.tmuxSet('status-right-style', style);
    } catch {
      // tmux session may not exist yet
    }
  }

  private statusToLabel(status: string): string {
    switch (status) {
      case 'starting': return 'STARTING...';
      case 'running': return 'RUNNING';
      case 'blocked': return 'BLOCKED';
      case 'prompt_ready': return 'READY';
      case 'completed': return 'DONE';
      case 'failed': return 'FAILED';
      default: return status.toUpperCase();
    }
  }

  private statusToStyle(status: string): string {
    switch (status) {
      case 'running': return 'fg=black,bg=green';
      case 'blocked': return 'fg=black,bg=yellow,bold';
      case 'completed': return 'fg=black,bg=cyan';
      case 'failed': return 'fg=white,bg=red,bold';
      default: return 'fg=black,bg=cyan';
    }
  }

  private tmuxSet(option: string, value: string): void {
    execSync(
      `tmux set-option -t ${this.config.tmuxSession} ${option} "${value}"`,
      { stdio: 'pipe' }
    );
  }
}
