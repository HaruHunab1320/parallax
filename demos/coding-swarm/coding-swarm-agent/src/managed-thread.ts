/**
 * Managed Thread
 *
 * Bridges tmux-manager session events to gateway thread protocol messages.
 * Each ManagedThread wraps a single coding CLI session and translates
 * pty-manager-style events to GatewayThreadEvent/GatewayThreadStatusUpdate.
 */

import type { GatewayThreadEvent, GatewayThreadStatusUpdate } from '@parallaxai/sdk-typescript';
import type { TmuxManager } from 'tmux-manager';
import type { Logger } from 'pino';

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
  private readonly listeners: Array<() => void> = [];

  constructor(
    public readonly info: ManagedThreadInfo,
    private readonly manager: TmuxManager,
    private readonly onEvent: (event: GatewayThreadEvent) => void,
    private readonly onStatusUpdate: (update: GatewayThreadStatusUpdate) => void,
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
      this.emitEvent('ready', {});
      this.emitStatus('running', 'Agent ready and accepting input');
    });

    on('message', (message: any) => {
      if (message.sessionId !== sessionId) return;
      this.emitEvent('output', {
        type: message.type,
        content: message.content,
      });
    });

    on('blocking_prompt', (session: any, promptInfo: any, autoResponded: boolean) => {
      if (session.id !== sessionId) return;
      this.emitEvent('blocked', {
        prompt: promptInfo.prompt,
        type: promptInfo.type,
        options: promptInfo.options,
        autoResponded,
      });
      if (!autoResponded) {
        this.emitStatus('blocked', `Blocked: ${promptInfo.prompt || 'awaiting input'}`);
      }
    });

    on('task_complete', (session: any, data?: any) => {
      if (session.id !== sessionId) return;
      this.emitEvent('turn_complete', {
        output: data?.output || '',
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

    on('stall_detected', (session: any, _recentOutput: string, stallDurationMs: number) => {
      if (session.id !== sessionId) return;
      this.emitEvent('stall', { stallDurationMs });
    });

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
      this.logger.warn({ threadId: this.info.threadId, error }, 'Error stopping thread session');
    }
  }
}
