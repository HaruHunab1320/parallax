import { EventEmitter } from 'events';
import type {
  AutoResponseRule,
  SessionHandle,
  SessionMessage,
  StopOptions,
  WorkerSessionHandle,
} from 'pty-manager';
import type {
  PTYConsoleBridgeOptions,
  PTYConsoleSnapshot,
  PTYManagerLike,
  PTYManagerAsyncLike,
  SessionOutputEvent,
  SessionStatusEvent,
} from './types.js';

const DEFAULT_MAX_BUFFERED_CHARS = 50_000;

type AnySessionHandle = SessionHandle | WorkerSessionHandle;

function isAsyncManager(
  manager: PTYManagerLike | PTYManagerAsyncLike,
): manager is PTYManagerAsyncLike {
  return 'onSessionData' in manager && typeof (manager as PTYManagerAsyncLike).onSessionData === 'function';
}

/**
 * PTYConsoleBridge turns PTYManager sessions/events into a UI-friendly stream:
 * - live output fan-out per session
 * - per-session buffered output snapshots
 * - control helpers (send/write/keys/stop/resize/rules)
 *
 * Supports both sync (PTYManagerLike) and async (PTYManagerAsyncLike) managers.
 */
export class PTYConsoleBridge extends EventEmitter {
  private readonly manager: PTYManagerLike | PTYManagerAsyncLike;
  private readonly isAsync: boolean;
  private readonly maxBufferedChars: number;
  private readonly bufferedOutput = new Map<string, string>();
  private readonly terminalUnsubscribers = new Map<string, () => void>();
  private readonly managerListeners = new Map<string, (...args: unknown[]) => void>();
  /** For async managers: cache sessions locally from events */
  private readonly asyncSessions = new Map<string, AnySessionHandle>();

  constructor(manager: PTYManagerLike | PTYManagerAsyncLike, options: PTYConsoleBridgeOptions = {}) {
    super();
    this.manager = manager;
    this.isAsync = isAsyncManager(manager);
    this.maxBufferedChars = options.maxBufferedCharsPerSession ?? DEFAULT_MAX_BUFFERED_CHARS;
    this.bindManagerEvents();
    this.attachToExistingSessions();
  }

  listSessions(): AnySessionHandle[] {
    if (this.isAsync) {
      return [...this.asyncSessions.values()];
    }
    return (this.manager as PTYManagerLike).list();
  }

  getSession(sessionId: string): AnySessionHandle | null {
    return this.manager.get(sessionId) ?? null;
  }

  getBufferedOutput(sessionId: string): string {
    return this.bufferedOutput.get(sessionId) ?? '';
  }

  getSnapshot(): PTYConsoleSnapshot[] {
    return this.listSessions().map((session) => ({
      session,
      bufferedOutput: this.getBufferedOutput(session.id),
    }));
  }

  sendMessage(sessionId: string, message: string): SessionMessage | void {
    if (this.isAsync) {
      (this.manager as PTYManagerAsyncLike).send(sessionId, message);
      return;
    }
    return (this.manager as PTYManagerLike).send(sessionId, message);
  }

  writeRaw(sessionId: string, data: string): void | Promise<void> {
    if (this.isAsync) {
      return (this.manager as PTYManagerAsyncLike).writeRaw(sessionId, data);
    }
    const session = (this.manager as PTYManagerLike).getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.writeRaw(data);
  }

  sendKeys(sessionId: string, keys: string[] | string): void | Promise<void> {
    if (this.isAsync) {
      return (this.manager as PTYManagerAsyncLike).sendKeys(sessionId, keys);
    }
    const session = (this.manager as PTYManagerLike).getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.sendKeys(keys);
  }

  resize(sessionId: string, cols: number, rows: number): void | Promise<void> {
    if (this.isAsync) {
      return (this.manager as PTYManagerAsyncLike).resize(sessionId, cols, rows);
    }
    const session = (this.manager as PTYManagerLike).getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.resize(cols, rows);
  }

  async stopSession(sessionId: string, options?: StopOptions): Promise<void> {
    if (this.isAsync) {
      await (this.manager as PTYManagerAsyncLike).kill(sessionId);
      return;
    }
    await (this.manager as PTYManagerLike).stop(sessionId, options);
  }

  addAutoResponseRule(sessionId: string, rule: AutoResponseRule): void | Promise<void> {
    if (this.isAsync) {
      return (this.manager as PTYManagerAsyncLike).addAutoResponseRule(sessionId, rule);
    }
    const session = (this.manager as PTYManagerLike).getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.addAutoResponseRule(rule);
  }

  clearAutoResponseRules(sessionId: string): void | Promise<void> {
    if (this.isAsync) {
      return (this.manager as PTYManagerAsyncLike).clearAutoResponseRules(sessionId);
    }
    const session = (this.manager as PTYManagerLike).getSession(sessionId);
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
    if (this.isAsync) {
      const asyncManager = this.manager as PTYManagerAsyncLike;
      asyncManager.list().then((sessions) => {
        for (const session of sessions) {
          this.asyncSessions.set(session.id, session);
          this.ensureTerminalAttachment(session.id);
        }
      });
      return;
    }
    for (const session of (this.manager as PTYManagerLike).list()) {
      this.ensureTerminalAttachment(session.id);
    }
  }

  private bindManagerEvents(): void {
    this.listen('session_started', (session: AnySessionHandle) => {
      if (this.isAsync) {
        this.asyncSessions.set(session.id, session);
      }
      this.ensureTerminalAttachment(session.id);
      this.emitStatus({ kind: 'started', session: session as SessionHandle });
    });

    this.listen('session_ready', (session: AnySessionHandle) => {
      if (this.isAsync) {
        this.asyncSessions.set(session.id, session);
      }
      this.emitStatus({ kind: 'ready', session: session as SessionHandle });
    });

    this.listen('session_stopped', (session: AnySessionHandle, reason: string) => {
      this.detachTerminal(session.id);
      if (this.isAsync) {
        this.asyncSessions.delete(session.id);
      }
      this.emitStatus({ kind: 'stopped', session: session as SessionHandle, reason });
    });

    this.listen('session_error', (session: AnySessionHandle, error: string) => {
      this.emitStatus({ kind: 'error', session: session as SessionHandle, error });
    });

    this.listen('session_status_changed', (session: AnySessionHandle) => {
      if (this.isAsync) {
        this.asyncSessions.set(session.id, session);
      }
      this.emitStatus({ kind: 'status_changed', session: session as SessionHandle });
    });

    this.listen('task_complete', (session: AnySessionHandle) => {
      this.emitStatus({ kind: 'task_complete', session: session as SessionHandle });
    });

    this.listen('login_required', (session: AnySessionHandle, instructions?: string, url?: string) => {
      this.emitStatus({ kind: 'login_required', session: session as SessionHandle, instructions, url });
    });

    this.listen('auth_required', (session: AnySessionHandle, auth: SessionStatusEvent['auth']) => {
      this.emitStatus({ kind: 'auth_required', session: session as SessionHandle, auth });
    });

    this.listen(
      'blocking_prompt',
      (session: AnySessionHandle, promptInfo: SessionStatusEvent['promptInfo'], autoResponded: boolean) => {
        this.emitStatus({ kind: 'blocking_prompt', session: session as SessionHandle, promptInfo, autoResponded });
      }
    );

    this.listen('question', (session: AnySessionHandle, question: string) => {
      this.emitStatus({ kind: 'question', session: session as SessionHandle, question });
    });

    this.listen('message', (message: SessionMessage) => {
      const session = this.manager.get(message.sessionId);
      if (!session) return;
      this.emitStatus({ kind: 'message', session: session as SessionHandle, message });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listen(event: string, handler: (...args: any[]) => void): void {
    this.manager.on(event, handler as (...args: unknown[]) => void);
    this.managerListeners.set(event, handler as (...args: unknown[]) => void);
  }

  private ensureTerminalAttachment(sessionId: string): void {
    if (this.terminalUnsubscribers.has(sessionId)) return;

    if (this.isAsync) {
      const asyncManager = this.manager as PTYManagerAsyncLike;
      const unsubscribe = asyncManager.onSessionData(sessionId, (data) => {
        this.handleSessionData(sessionId, data);
      });
      this.terminalUnsubscribers.set(sessionId, unsubscribe);
      return;
    }

    const terminal = (this.manager as PTYManagerLike).attachTerminal(sessionId);
    if (!terminal) return;

    const unsubscribe = terminal.onData((data) => {
      this.handleSessionData(sessionId, data);
    });
    this.terminalUnsubscribers.set(sessionId, unsubscribe);
  }

  private handleSessionData(sessionId: string, data: string): void {
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
