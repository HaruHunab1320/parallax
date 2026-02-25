import type {
  SessionHandle,
  SessionMessage,
  StopOptions,
  TerminalAttachment,
  BlockingPromptInfo,
  AuthRequiredInfo,
  AutoResponseRule,
  ToolRunningInfo,
  WorkerSessionHandle,
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
    | 'auth_required'
    | 'blocking_prompt'
    | 'question'
    | 'message'
    | 'tool_running';
  session: SessionHandle;
  reason?: string;
  error?: string;
  instructions?: string;
  url?: string;
  auth?: AuthRequiredInfo;
  promptInfo?: BlockingPromptInfo;
  autoResponded?: boolean;
  question?: string;
  message?: SessionMessage;
  toolInfo?: ToolRunningInfo;
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

export interface PTYManagerAsyncLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  list(): Promise<(SessionHandle | WorkerSessionHandle)[]>;
  get(sessionId: string): SessionHandle | WorkerSessionHandle | null | undefined;
  onSessionData(sessionId: string, callback: (data: string) => void): () => void;
  send(sessionId: string, data: string): Promise<void>;
  sendKeys(sessionId: string, keys: string[] | string): Promise<void>;
  writeRaw(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  kill(sessionId: string, signal?: string): Promise<void>;
  addAutoResponseRule(sessionId: string, rule: AutoResponseRule): Promise<void>;
  clearAutoResponseRules(sessionId: string): Promise<void>;
}
