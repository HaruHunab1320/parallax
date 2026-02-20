import type {
  SessionHandle,
  SessionMessage,
  StopOptions,
  TerminalAttachment,
  BlockingPromptInfo,
  AutoResponseRule,
} from 'pty-manager';

export interface PTYConsoleBridgeOptions {
  maxBufferedCharsPerSession?: number;
}

export interface SessionOutputEvent {
  sessionId: string;
  data: string;
  bufferedLength: number;
  timestamp: Date;
}

export interface SessionStatusEvent {
  kind:
    | 'started'
    | 'ready'
    | 'stopped'
    | 'error'
    | 'status_changed'
    | 'task_complete'
    | 'login_required'
    | 'blocking_prompt'
    | 'question'
    | 'message';
  session: SessionHandle;
  reason?: string;
  error?: string;
  instructions?: string;
  url?: string;
  promptInfo?: BlockingPromptInfo;
  autoResponded?: boolean;
  question?: string;
  message?: SessionMessage;
}

export interface PTYConsoleSnapshot {
  session: SessionHandle;
  bufferedOutput: string;
}

export interface PTYManagerLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  list(): SessionHandle[];
  get(sessionId: string): SessionHandle | null;
  attachTerminal(sessionId: string): TerminalAttachment | null;
  send(sessionId: string, message: string): SessionMessage;
  stop(sessionId: string, options?: StopOptions): Promise<void>;
  getSession(sessionId: string): {
    sendKeys: (keys: string[] | string) => void;
    resize: (cols: number, rows: number) => void;
    writeRaw: (data: string) => void;
    addAutoResponseRule: (rule: AutoResponseRule) => void;
    clearAutoResponseRules: () => void;
  } | undefined;
}

