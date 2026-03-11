/**
 * Tmux Manager Types
 *
 * Re-exports adapter types from adapter-types package,
 * plus manager-specific type definitions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Re-exported from adapter-types (backwards compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export type {
  MessageType,
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptType,
  BlockingPromptDetection,
  AutoResponseRule,
  ToolRunningInfo,
  AdapterFactoryConfig,
} from 'adapter-types';

// ─────────────────────────────────────────────────────────────────────────────
// Session Types (manager-specific)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Session lifecycle states
 */
export type SessionStatus =
  | 'pending'        // Requested, not yet started
  | 'starting'       // Process starting
  | 'authenticating' // Waiting for login
  | 'ready'          // Available for input
  | 'busy'           // Processing a message
  | 'stopping'       // Graceful shutdown
  | 'stopped'        // Terminated
  | 'error';         // Failed state

/**
 * Handle to a running session
 */
export interface SessionHandle {
  id: string;
  name: string;
  type: string;
  status: SessionStatus;
  pid?: number;
  startedAt?: Date;
  lastActivityAt?: Date;
  error?: string;
  exitCode?: number;
  /** Tmux session name (for reconnection) */
  tmuxSessionName?: string;
}

/**
 * Message to/from a session
 */
export interface SessionMessage {
  id: string;
  sessionId: string;
  direction: 'inbound' | 'outbound';
  type: import('adapter-types').MessageType;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Filter for listing sessions
 */
export interface SessionFilter {
  status?: SessionStatus | SessionStatus[];
  type?: string | string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Types (manager-specific)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalized authentication methods for runtime event consumers.
 */
export type AuthRequiredMethod =
  | 'api_key'
  | 'cli_auth'
  | 'oauth_browser'
  | 'device_code'
  | 'unknown';

/**
 * Structured authentication-required payload emitted by tmux session/manager.
 */
export interface AuthRequiredInfo {
  method: AuthRequiredMethod;
  url?: string;
  deviceCode?: string;
  instructions?: string;
  promptSnippet?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocking Prompt Info (manager-specific event type)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Blocking prompt info for events
 */
export interface BlockingPromptInfo {
  type: import('adapter-types').BlockingPromptType | string;
  prompt?: string;
  options?: string[];
  canAutoRespond: boolean;
  instructions?: string;
  url?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stall Detection Types (manager-specific)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classification result from external stall analysis
 */
export interface StallClassification {
  /** What the external classifier determined */
  state: 'waiting_for_input' | 'still_working' | 'task_complete' | 'error';

  /** Description of the detected prompt (for waiting_for_input) */
  prompt?: string;

  /** Suggested response to send (for waiting_for_input with auto-respond) */
  suggestedResponse?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manager Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logger interface (bring your own logger)
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  debug(context: Record<string, unknown>, message: string): void;
  info(message: string, context?: Record<string, unknown>): void;
  info(context: Record<string, unknown>, message: string): void;
  warn(message: string, context?: Record<string, unknown>): void;
  warn(context: Record<string, unknown>, message: string): void;
  error(message: string, context?: Record<string, unknown>): void;
  error(context: Record<string, unknown>, message: string): void;
}

/**
 * Options for stopping a session
 */
export interface StopOptions {
  /** Force kill without graceful shutdown */
  force?: boolean;

  /** Timeout in ms before force kill (default: 5000) */
  timeout?: number;
}

/**
 * Options for reading logs
 */
export interface LogOptions {
  /** Number of lines from the end */
  tail?: number;
}

/**
 * Terminal attachment for raw I/O streaming
 */
export interface TerminalAttachment {
  /** Subscribe to raw terminal output (returns unsubscribe function) */
  onData: (callback: (data: string) => void) => () => void;

  /** Write raw data to terminal */
  write: (data: string) => void;

  /** Resize the terminal */
  resize: (cols: number, rows: number) => void;
}

/**
 * TmuxManager configuration
 */
export interface TmuxManagerConfig {
  /** Logger instance (optional - uses console if not provided) */
  logger?: Logger;

  /** Maximum output log lines per session (default: 1000) */
  maxLogLines?: number;

  /** Enable stall detection (default: false) */
  stallDetectionEnabled?: boolean;

  /** Default stall timeout in ms (default: 8000). Can be overridden per-session via SpawnConfig. */
  stallTimeoutMs?: number;

  /**
   * External classification callback invoked when a stall is detected.
   */
  onStallClassify?: (
    sessionId: string,
    recentOutput: string,
    stallDurationMs: number
  ) => Promise<StallClassification | null>;

  /** Tmux scrollback history limit per session (default: 50000) */
  historyLimit?: number;

  /** Tmux session name prefix (default: 'parallax') */
  sessionPrefix?: string;
}
