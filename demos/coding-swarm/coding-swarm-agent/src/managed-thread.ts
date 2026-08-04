/**
 * Managed Thread
 *
 * Bridges tmux-manager session events to gateway thread protocol messages.
 * Each ManagedThread wraps a single coding CLI session and translates
 * pty-manager-style events to GatewayThreadEvent/GatewayThreadStatusUpdate.
 */

import { parseConfidenceMarker, stripAnsi } from '@parallaxai/sdk-typescript';
import type {
  GatewayThreadEvent,
  GatewayThreadStatusUpdate,
} from '@parallaxai/sdk-typescript';
import type { Logger } from 'pino';
import type { TmuxManager } from 'tmux-manager';

export interface ManagedThreadInfo {
  threadId: string;
  sessionId: string;
  adapterType: string;
  workspaceDir: string;
  startedAt: Date;
}

export class ManagedThread {
  private sequence: number = 0;
  private status: string = 'starting';
  /**
   * When true, a priming (objective) turn was delivered at spawn and its
   * completion must be CONSUMED — not forwarded as a task `turn_complete` —
   * with `ready` deferred until it lands. Set by ThreadExecutor before the
   * session becomes ready.
   *
   * Without this, the priming turn races the real task turn: the control
   * plane's task waiter subscribes then dispatches the task, and the
   * priming turn's completion (which arrives first) resolves the waiter
   * with the wrong output. The local runtime has no priming turn at all —
   * it passes the objective as an env var — so this only bites the gateway.
   */
  public expectPrimingTurn = false;

  /**
   * Timestamp of the last sign of life from the session (output or a
   * completed turn). ThreadExecutor compares this against the time it sent
   * input to tell "the CLI never saw my keystrokes" apart from "the CLI
   * answered already and went back to idle".
   */
  public lastActivityAt = 0;

  private readonly listeners: Array<() => void> = [];

  constructor(
    public readonly info: ManagedThreadInfo,
    private readonly manager: TmuxManager,
    private readonly onEvent: (event: GatewayThreadEvent) => void,
    private readonly onStatusUpdate: (
      update: GatewayThreadStatusUpdate
    ) => void,
    private readonly logger: Logger
  ) {
    this.bindEvents();
  }

  get threadId(): string {
    return this.info.threadId;
  }

  get sessionId(): string {
    return this.info.sessionId;
  }

  private bindEvents(): void {
    const { threadId, sessionId } = this.info;
    const mgr = this.manager;

    const on = (event: string, handler: (...args: any[]) => void) => {
      mgr.on(event, handler);
      this.listeners.push(() => mgr.removeListener(event, handler));
    };

    on('session_ready', (session: any) => {
      if (session.id !== sessionId) return;
      this.status = 'running';
      if (this.expectPrimingTurn) {
        // Priming (objective) turn is in flight — defer `ready` until it
        // completes so the control plane doesn't dispatch a task mid-priming.
        this.emitStatus('running', 'Priming agent…');
        return;
      }
      this.emitEvent('ready', {});
      this.emitStatus('running', 'Agent ready and accepting input');
    });

    on('message', (message: any) => {
      if (message.sessionId !== sessionId) return;
      this.lastActivityAt = Date.now();
      this.emitEvent('output', {
        type: message.type,
        content: message.content,
      });
    });

    on(
      'blocking_prompt',
      (session: any, promptInfo: any, autoResponded: boolean) => {
        if (session.id !== sessionId) return;
        this.emitEvent('blocked', {
          prompt: promptInfo.prompt,
          type: promptInfo.type,
          options: promptInfo.options,
          autoResponded,
        });
        if (!autoResponded) {
          this.emitStatus(
            'blocked',
            `Blocked: ${promptInfo.prompt || 'awaiting input'}`
          );
        }
      }
    );

    on('task_complete', (session: any, data?: any) => {
      this.logger.info(
        {
          sessionId: session?.id,
          expectedSessionId: sessionId,
          match: session?.id === sessionId,
        },
        'task_complete event received'
      );
      if (session.id !== sessionId) return;
      this.lastActivityAt = Date.now();

      if (this.expectPrimingTurn) {
        // This completion is the priming (objective) turn — the agent is
        // now primed and idle. Emit the deferred `ready` and do NOT forward
        // it as a task turn_complete (that would resolve the CP's task
        // waiter with the objective response instead of the task result).
        this.expectPrimingTurn = false;
        this.logger.info(
          { threadId },
          'Priming turn complete — emitting deferred ready'
        );
        this.emitEvent('ready', {});
        this.emitStatus('running', 'Primed and ready');
        return;
      }

      this.logger.info({ threadId }, 'Emitting turn_complete to gateway');
      // Raw TUI frames → readable text before anything downstream sees it
      const turnOutput: string = stripAnsi(data?.output || '').trim();
      const turnConfidence = parseConfidenceMarker(turnOutput);
      this.emitEvent('turn_complete', {
        output: turnOutput,
        ...(turnConfidence !== undefined
          ? { confidence: turnConfidence }
          : {}),
      });
      this.emitStatus('running', 'Turn complete, ready for next input');
    });

    on('tool_running', (session: any, toolInfo: any) => {
      if (session.id !== sessionId) return;
      this.emitEvent('tool_use', {
        tool: toolInfo.tool,
        description: toolInfo.description,
      });
    });

    on('session_stopped', (session: any, reason: string) => {
      if (session.id !== sessionId) return;
      const isError = reason === 'error' || reason === 'crash';
      this.status = isError ? 'failed' : 'completed';
      this.emitEvent(isError ? 'failed' : 'completed', { reason });
      this.emitStatus(this.status, `Thread ${this.status}: ${reason}`);
    });

    on('session_error', (session: any, error: string) => {
      if (session.id !== sessionId) return;
      this.status = 'failed';
      this.emitEvent('failed', { error });
      this.emitStatus('failed', `Thread error: ${error}`);
    });

    on(
      'stall_detected',
      (session: any, _recentOutput: string, stallDurationMs: number) => {
        if (session.id !== sessionId) return;
        this.emitEvent('stall', { stallDurationMs });
      }
    );

    on('session_status_changed', (session: any) => {
      if (session.id !== sessionId) return;
      if (session.status === 'ready') {
        this.emitStatus('running', 'Agent ready');
      } else if (session.status === 'busy') {
        this.emitStatus('running', 'Agent working');
      }
    });
  }

  private emitEvent(eventType: string, data: Record<string, any>): void {
    this.onEvent({
      thread_id: this.info.threadId,
      event_type: eventType,
      data_json: JSON.stringify(data),
      timestamp_ms: Date.now(),
      sequence: this.sequence++,
    });
  }

  private emitStatus(status: string, summary: string): void {
    this.status = status;
    this.onStatusUpdate({
      thread_id: this.info.threadId,
      status,
      summary,
      progress: status === 'completed' ? 1.0 : status === 'failed' ? 0 : -1,
      timestamp_ms: Date.now(),
    });
  }

  /**
   * Send text input to the thread's tmux session.
   */
  sendInput(input: string): void {
    this.manager.send(this.info.sessionId, input);
  }

  /**
   * Clean up event listeners.
   */
  cleanup(): void {
    for (const unsub of this.listeners) {
      unsub();
    }
    this.listeners.length = 0;
  }

  /**
   * Stop the underlying tmux session.
   */
  async stop(force: boolean = false): Promise<void> {
    this.cleanup();
    try {
      await this.manager.stop(this.info.sessionId, {
        force,
        timeout: force ? 5000 : 30000,
      });
    } catch (error) {
      this.logger.warn(
        { threadId: this.info.threadId, error },
        'Error stopping thread session'
      );
    }
  }
}
