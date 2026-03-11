/**
 * Shared Adapter Types
 *
 * Type definitions used by the adapter interface and shared across
 * pty-manager, tmux-manager, and coding-agent-adapters.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Message Types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Spawn Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for spawning a session
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

  /** Per-session stall timeout in ms. Overrides manager config. */
  stallTimeoutMs?: number;

  /** Override adapter's readySettleMs for this session.
   *  Ms of output silence after detectReady match before emitting session_ready. */
  readySettleMs?: number;

  /** Enable verbose task-completion trace logs.
   *  Disabled by default; set true to enable. */
  traceTaskCompletion?: boolean;

  /** Override or disable specific adapter auto-response rules for this session.
   *  Keys are regex source strings (from rule.pattern.source).
   *  - null value disables that rule entirely
   *  - Object value merges fields into the matching adapter rule */
  ruleOverrides?: Record<string, Partial<Omit<AutoResponseRule, 'pattern'>> | null>;

  /** When true, adapter detectBlockingPrompt() results with suggestedResponse
   *  are emitted as autoResponded=false instead of being auto-responded.
   *  Auto-response rules (ruleOverrides) are unaffected. */
  skipAdapterAutoResponse?: boolean;

  /**
   * Whether to inherit the parent process environment variables.
   * When `true` (default), `process.env` is spread as the base of the spawned
   * process environment. When `false`, only `adapter.getEnv()` output and
   * `config.env` are used — the caller is responsible for providing any
   * necessary system vars (PATH, HOME, etc.) via `config.env`.
   *
   * Set to `false` for security-sensitive contexts where the host process has
   * secrets that spawned agents should not access.
   */
  inheritProcessEnv?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter Output Types
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
  type?: 'api_key' | 'oauth' | 'browser' | 'device_code' | 'cli_auth';
  url?: string;
  deviceCode?: string;
  instructions?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocking Prompt Types
// ─────────────────────────────────────────────────────────────────────────────

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
  | 'tool_wait'      // Agent waiting on tool/shell interaction
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

// ─────────────────────────────────────────────────────────────────────────────
// Tool Running Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Information about an external tool/process running within a session.
 * Emitted when the adapter detects a tool is actively executing (e.g. browser,
 * bash command, Node process). Suppresses stall detection while active.
 */
export interface ToolRunningInfo {
  /** Name of the tool (e.g. "Chrome", "bash", "node", "python") */
  toolName: string;
  /** Optional description of what the tool is doing */
  description?: string;
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
