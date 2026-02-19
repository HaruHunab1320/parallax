/**
 * PTY Agent Manager Types
 *
 * Standalone type definitions for PTY session and adapter management.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Session Types
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
 * Message types for session communication
 */
export type MessageType =
  | 'task'           // A task/instruction for the session
  | 'response'       // Session's response to a task
  | 'question'       // Session asking for clarification
  | 'answer'         // Answer to a session's question
  | 'status'         // Status update
  | 'error';         // Error message

/**
 * Configuration for spawning a PTY session
 */
export interface SpawnConfig {
  /** Optional unique ID (auto-generated if not provided) */
  id?: string;

  /** Human-readable name */
  name: string;

  /** Adapter type to use */
  type: string;

  /** Working directory */
  workdir?: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Initial terminal columns (default: 120) */
  cols?: number;

  /** Initial terminal rows (default: 40) */
  rows?: number;

  /** Session timeout in ms */
  timeout?: number;

  /** Custom adapter configuration */
  adapterConfig?: Record<string, unknown>;

  /** Per-session stall timeout in ms. Overrides PTYManagerConfig.stallTimeoutMs. */
  stallTimeoutMs?: number;
}

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
}

/**
 * Message to/from a session
 */
export interface SessionMessage {
  id: string;
  sessionId: string;
  direction: 'inbound' | 'outbound';
  type: MessageType;
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
// Adapter Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsed output from a CLI
 */
export interface ParsedOutput {
  type: MessageType;
  content: string;
  isComplete: boolean;
  isQuestion: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Login/auth detection result
 */
export interface LoginDetection {
  required: boolean;
  type?: 'api_key' | 'oauth' | 'browser' | 'device_code';
  url?: string;
  instructions?: string;
}

/**
 * Types of blocking prompts that can occur
 */
export type BlockingPromptType =
  | 'login'          // Authentication required
  | 'update'         // Update/upgrade available
  | 'config'         // Configuration choice needed
  | 'tos'            // Terms of service acceptance
  | 'model_select'   // Model/version selection
  | 'project_select' // Project/workspace selection
  | 'permission'     // Permission request
  | 'unknown';       // Unrecognized blocking prompt

/**
 * Blocking prompt detection result
 */
export interface BlockingPromptDetection {
  /** Whether a blocking prompt was detected */
  detected: boolean;

  /** Type of blocking prompt */
  type?: BlockingPromptType;

  /** The prompt text shown to the user */
  prompt?: string;

  /** Available options/choices if detected */
  options?: string[];

  /** Suggested auto-response (if safe to auto-respond) */
  suggestedResponse?: string;

  /** Whether it's safe to auto-respond without user confirmation */
  canAutoRespond?: boolean;

  /** Instructions for the user if manual intervention needed */
  instructions?: string;

  /** URL to open if browser action needed */
  url?: string;
}

/**
 * Auto-response rule for handling known blocking prompts
 */
export interface AutoResponseRule {
  /** Pattern to match in output */
  pattern: RegExp;

  /** Type of prompt this handles */
  type: BlockingPromptType;

  /** Response to send automatically */
  response: string;

  /** How to deliver the response: 'text' writes raw text + CR, 'keys' sends key sequences (default: 'text') */
  responseType?: 'text' | 'keys';

  /** Key names to send when responseType is 'keys' (e.g. ['down', 'enter']) */
  keys?: string[];

  /** Human-readable description of what this does */
  description: string;

  /** Whether this is safe to auto-respond (default: true) */
  safe?: boolean;

  /** Fire this rule at most once per session (prevents thrashing on TUI re-renders) */
  once?: boolean;
}

/**
 * Blocking prompt info for events
 */
export interface BlockingPromptInfo {
  type: BlockingPromptType | string;
  prompt?: string;
  options?: string[];
  canAutoRespond: boolean;
  instructions?: string;
  url?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stall Detection Types
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
 * PTYManager configuration
 */
export interface PTYManagerConfig {
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
   * Return null or { state: 'still_working' } to reset the timer.
   * Return { state: 'waiting_for_input', suggestedResponse } to auto-respond.
   * Return { state: 'task_complete' } to transition session to ready.
   * Return { state: 'error' } to emit session_error.
   */
  onStallClassify?: (
    sessionId: string,
    recentOutput: string,
    stallDurationMs: number
  ) => Promise<StallClassification | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter Factory Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for creating an adapter via factory
 */
export interface AdapterFactoryConfig {
  /** Command to execute */
  command: string;

  /** Default arguments */
  args?: string[] | ((config: SpawnConfig) => string[]);

  /** Environment variables */
  env?: Record<string, string> | ((config: SpawnConfig) => Record<string, string>);

  /** Login detection configuration */
  loginDetection?: {
    patterns: RegExp[];
    extractUrl?: (output: string) => string | null;
    extractInstructions?: (output: string) => string | null;
  };

  /** Blocking prompt configuration */
  blockingPrompts?: Array<{
    pattern: RegExp;
    type: BlockingPromptType;
    autoResponse?: string;
    safe?: boolean;
    description?: string;
  }>;

  /** Ready state indicators */
  readyIndicators?: RegExp[];

  /** Exit indicators */
  exitIndicators?: Array<{
    pattern: RegExp;
    codeExtractor?: (match: RegExpMatchArray) => number;
  }>;

  /** Output parser */
  parseOutput?: (output: string) => ParsedOutput | null;

  /** Input formatter */
  formatInput?: (message: string) => string;

  /** Prompt pattern for detecting input readiness */
  promptPattern?: RegExp;
}
