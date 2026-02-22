import { EventEmitter } from 'events';
import type {
  AutoResponseRule,
  SessionHandle,
  SessionMessage,
  StopOptions,
} from 'pty-manager';
import type {
  PTYConsoleBridgeOptions,
  PTYConsoleSnapshot,
  PTYManagerLike,
  SessionOutputEvent,
  SessionStatusEvent,
} from './types';

const DEFAULT_MAX_BUFFERED_CHARS = 50_000;

/**
 * PTYConsoleBridge turns PTYManager sessions/events into a UI-friendly stream:
 * - live output fan-out per session
 * - per-session buffered output snapshots
 * - control helpers (send/write/keys/stop/resize/rules)
 */
export class PTYConsoleBridge extends EventEmitter {
  private readonly manager: PTYManagerLike;
  private readonly maxBufferedChars: number;
  private readonly bufferedOutput = new Map<string, string>();
  private readonly terminalUnsubscribers = new Map<string, () => void>();
  private readonly managerListeners = new Map<string, (...args: unknown[]) => void>();

  constructor(manager: PTYManagerLike, options: PTYConsoleBridgeOptions = {}) {
    super();
    this.manager = manager;
    this.maxBufferedChars = options.maxBufferedCharsPerSession ?? DEFAULT_MAX_BUFFERED_CHARS;
    this.bindManagerEvents();
    this.attachToExistingSessions();
  }

  listSessions(): SessionHandle[] {
    return this.manager.list();
  }

  getSession(sessionId: string): SessionHandle | null {
    return this.manager.get(sessionId);
  }

  getBufferedOutput(sessionId: string): string {
    return this.bufferedOutput.get(sessionId) ?? '';
  }

  getSnapshot(): PTYConsoleSnapshot[] {
    return this.manager.list().map((session) => ({
      session,
      bufferedOutput: this.getBufferedOutput(session.id),
    }));
  }

  sendMessage(sessionId: string, message: string): SessionMessage {
    return this.manager.send(sessionId, message);
  }

  writeRaw(sessionId: string, data: string): void {
    const session = this.manager.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.writeRaw(data);
  }

  sendKeys(sessionId: string, keys: string[] | string): void {
    const session = this.manager.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.sendKeys(keys);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.manager.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.resize(cols, rows);
  }

  async stopSession(sessionId: string, options?: StopOptions): Promise<void> {
    await this.manager.stop(sessionId, options);
  }

  addAutoResponseRule(sessionId: string, rule: AutoResponseRule): void {
    const session = this.manager.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.addAutoResponseRule(rule);
  }

  clearAutoResponseRules(sessionId: string): void {
    const session = this.manager.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.clearAutoResponseRules();
  }

  close(): void {
    for (const unsub of this.terminalUnsubscribers.values()) {
      unsub();
    }
    this.terminalUnsubscribers.clear();

    for (const [event, handler] of this.managerListeners.entries()) {
      this.manager.off(event, handler);
    }
    this.managerListeners.clear();
    this.removeAllListeners();
  }

  private attachToExistingSessions(): void {
    for (const session of this.manager.list()) {
      this.ensureTerminalAttachment(session.id);
    }
  }

  private bindManagerEvents(): void {
    this.listen('session_started', (session: SessionHandle) => {
      this.ensureTerminalAttachment(session.id);
      this.emitStatus({ kind: 'started', session });
    });

    this.listen('session_ready', (session: SessionHandle) => {
      this.emitStatus({ kind: 'ready', session });
    });

    this.listen('session_stopped', (session: SessionHandle, reason: string) => {
      this.detachTerminal(session.id);
      this.emitStatus({ kind: 'stopped', session, reason });
    });

    this.listen('session_error', (session: SessionHandle, error: string) => {
      this.emitStatus({ kind: 'error', session, error });
    });

    this.listen('session_status_changed', (session: SessionHandle) => {
      this.emitStatus({ kind: 'status_changed', session });
    });

    this.listen('task_complete', (session: SessionHandle) => {
      this.emitStatus({ kind: 'task_complete', session });
    });

    this.listen('login_required', (session: SessionHandle, instructions?: string, url?: string) => {
      this.emitStatus({ kind: 'login_required', session, instructions, url });
    });

    this.listen('auth_required', (session: SessionHandle, auth: SessionStatusEvent['auth']) => {
      this.emitStatus({ kind: 'auth_required', session, auth });
    });

    this.listen(
      'blocking_prompt',
      (session: SessionHandle, promptInfo: SessionStatusEvent['promptInfo'], autoResponded: boolean) => {
        this.emitStatus({ kind: 'blocking_prompt', session, promptInfo, autoResponded });
      }
    );

    this.listen('question', (session: SessionHandle, question: string) => {
      this.emitStatus({ kind: 'question', session, question });
    });

    this.listen('message', (message: SessionMessage) => {
      const session = this.manager.get(message.sessionId);
      if (!session) return;
      this.emitStatus({ kind: 'message', session, message });
    });
  }

  private listen(event: string, handler: (...args: unknown[]) => void): void {
    this.manager.on(event, handler);
    this.managerListeners.set(event, handler);
  }

  private ensureTerminalAttachment(sessionId: string): void {
    if (this.terminalUnsubscribers.has(sessionId)) return;

    const terminal = this.manager.attachTerminal(sessionId);
    if (!terminal) return;

    const unsubscribe = terminal.onData((data) => {
      const current = this.bufferedOutput.get(sessionId) ?? '';
      const next = (current + data).slice(-this.maxBufferedChars);
      this.bufferedOutput.set(sessionId, next);

      const outputEvent: SessionOutputEvent = {
        sessionId,
        data,
        bufferedLength: next.length,
        timestamp: new Date(),
      };
      this.emit('session_output', outputEvent);
    });

    this.terminalUnsubscribers.set(sessionId, unsubscribe);
  }

  private detachTerminal(sessionId: string): void {
    const unsubscribe = this.terminalUnsubscribers.get(sessionId);
    if (unsubscribe) {
      unsubscribe();
      this.terminalUnsubscribers.delete(sessionId);
    }
  }

  private emitStatus(event: SessionStatusEvent): void {
    this.emit('session_status', event);
  }
}
