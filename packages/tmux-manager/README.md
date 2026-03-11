# tmux-manager

Tmux-based session manager with lifecycle management, pluggable adapters, and blocking prompt detection. Drop-in alternative to [pty-manager](../pty-manager) — no native addons required.

## Why tmux-manager?

| | pty-manager | tmux-manager |
|---|---|---|
| **Backend** | node-pty (native C++ addon) | tmux CLI (system binary) |
| **Native compilation** | Required (node-gyp, build tools) | None |
| **Runtime support** | Node.js + Bun (with compat shim) | Any JS runtime |
| **Session persistence** | Dies with parent process | Survives crashes |
| **Crash recovery** | Not possible | `reconnect()` to existing sessions |
| **Output latency** | ~0ms (event-driven) | ~50-100ms (polling) |
| **Windows** | Supported (ConPTY) | Not supported (WSL only) |

Choose **tmux-manager** when you need crash-resilient sessions, simpler installs (CI/CD, Docker, serverless), or cross-runtime support. Choose **pty-manager** when you need sub-millisecond output latency, Windows support, or byte-level PTY streaming.

## Features

- **Multi-session management** — Spawn and manage multiple tmux sessions concurrently
- **Pluggable adapters** — Built-in shell adapter, easy to create custom adapters for any CLI tool
- **Crash recovery** — Reconnect to orphaned tmux sessions after parent process crashes
- **Blocking prompt detection** — Detect login prompts, confirmations, and interactive prompts
- **Auto-response rules** — Automatically respond to known prompts with text or key sequences
- **Stall detection** — Content-based stall detection with pluggable external classifiers and exponential backoff
- **Task completion detection** — Settle-based fast-path that short-circuits the LLM stall classifier when the CLI returns to its idle prompt
- **Special key support** — Send Ctrl, Alt, Shift, and function key combinations via `sendKeys()`
- **Session inspection** — `tmux attach` to any managed session from another terminal
- **Orphan management** — List and clean up sessions from crashed processes
- **Zero native dependencies** — No node-gyp, no build tools, no platform-specific compilation
- **Event-driven** — Rich event system for session lifecycle
- **TypeScript-first** — Full type definitions included

## Prerequisites

tmux must be installed on the system:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# Fedora/RHEL
sudo dnf install tmux

# Alpine
apk add tmux
```

Requires tmux 3.0+ and Node.js 18+.

## Installation

```bash
npm install tmux-manager
# or
pnpm add tmux-manager
# or
yarn add tmux-manager
```

## Quick Start

```typescript
import { TmuxManager, ShellAdapter } from 'tmux-manager';

// Create manager
const manager = new TmuxManager();

// Register adapters
manager.registerAdapter(new ShellAdapter());

// Spawn a session
const handle = await manager.spawn({
  name: 'my-shell',
  type: 'shell',
  workdir: '/path/to/project',
});

// Listen for events
manager.on('session_ready', ({ id }) => {
  console.log(`Session ${id} is ready`);
});

// Send commands
manager.send(handle.id, 'echo "Hello, World!"');

// Stop session
await manager.stop(handle.id);

// Shut down all sessions
await manager.shutdown();
```

## Crash Recovery

tmux sessions survive parent process crashes. Use `reconnect()` to reattach:

```typescript
const manager = new TmuxManager({ sessionPrefix: 'my-app' });
manager.registerAdapter(new ShellAdapter());

// Find orphaned sessions from a previous crash
const orphans = manager.listOrphanedSessions();
console.log(`Found ${orphans.length} orphaned sessions`);

// Clean them up
manager.cleanupOrphanedSessions();

// Or reconnect to a specific session
const session = await manager.spawn({ name: 'recovered', type: 'shell' });
// session.reconnect('my-app-previous-session-id');
```

You can also inspect any managed session from another terminal:

```bash
# List all managed sessions
tmux list-sessions | grep my-app

# Attach to watch a session live
tmux attach -t my-app-session-id
```

## Creating Custom Adapters

### Using the Factory

```typescript
import { createAdapter } from 'tmux-manager';

const myCliAdapter = createAdapter({
  command: 'my-cli',
  args: ['--interactive'],

  loginDetection: {
    patterns: [/please log in/i, /auth required/i],
    extractUrl: (output) => output.match(/https:\/\/[^\s]+/)?.[0] || null,
  },

  blockingPrompts: [
    { pattern: /\[Y\/n\]/i, type: 'config', autoResponse: 'Y' },
    { pattern: /continue\?/i, type: 'config', autoResponse: 'yes' },
  ],

  readyIndicators: [/\$ $/, /ready>/i],
});

manager.registerAdapter(myCliAdapter);
```

### Extending BaseCLIAdapter

```typescript
import { BaseCLIAdapter } from 'tmux-manager';

class MyCLIAdapter extends BaseCLIAdapter {
  readonly adapterType = 'my-cli';
  readonly displayName = 'My CLI Tool';

  getCommand() {
    return 'my-cli';
  }

  getArgs(config) {
    return ['--mode', 'interactive'];
  }

  getEnv(config) {
    return { MY_CLI_CONFIG: config.name };
  }

  detectLogin(output) {
    if (/login required/i.test(output)) {
      return { required: true, type: 'browser' };
    }
    return { required: false };
  }

  detectReady(output) {
    return /ready>/.test(output);
  }

  detectTaskComplete(output) {
    return /done in \d+s/.test(output) && /ready>/.test(output);
  }

  detectLoading(output) {
    return /processing|loading/i.test(output);
  }

  parseOutput(output) {
    return {
      type: 'response',
      content: output.trim(),
      isComplete: true,
      isQuestion: output.includes('?'),
    };
  }

  getPromptPattern() {
    return /my-cli>/;
  }
}
```

## API Reference

### TmuxManager

```typescript
class TmuxManager extends EventEmitter {
  constructor(config?: TmuxManagerConfig);

  // Adapter management
  registerAdapter(adapter: CLIAdapter): void;
  readonly adapters: AdapterRegistry;

  // Session lifecycle
  spawn(config: SpawnConfig): Promise<SessionHandle>;
  stop(id: string, options?: StopOptions): Promise<void>;
  stopAll(options?: StopOptions): Promise<void>;
  shutdown(): Promise<void>;

  // Session operations
  get(id: string): SessionHandle | null;
  list(filter?: SessionFilter): SessionHandle[];
  send(id: string, message: string): SessionMessage;
  logs(id: string, options?: LogOptions): AsyncIterable<string>;
  metrics(id: string): { uptime?: number } | null;
  has(id: string): boolean;
  getStatusCounts(): Record<SessionStatus, number>;

  // Crash recovery
  listOrphanedSessions(): Array<{ name: string; created: string; attached: boolean }>;
  cleanupOrphanedSessions(): void;
}
```

### TmuxManagerConfig

```typescript
interface TmuxManagerConfig {
  logger?: Logger;
  maxLogLines?: number;               // Default: 1000
  stallDetectionEnabled?: boolean;     // Default: false
  stallTimeoutMs?: number;             // Default: 8000
  onStallClassify?: (sessionId: string, recentOutput: string, stallDurationMs: number)
    => Promise<StallClassification | null>;
  historyLimit?: number;               // Tmux scrollback lines (default: 50000)
  sessionPrefix?: string;              // Tmux session name prefix (default: 'parallax')
}
```

### TmuxTransport

Low-level tmux CLI wrapper. Used internally by TmuxSession but available for direct use.

```typescript
class TmuxTransport {
  spawn(sessionName: string, options: TmuxSpawnOptions): void;
  isAlive(sessionName: string): boolean;
  kill(sessionName: string): void;
  signal(sessionName: string, sig: string): void;
  sendText(sessionName: string, text: string): void;
  sendKey(sessionName: string, key: string): void;
  capturePane(sessionName: string, options?: TmuxCaptureOptions): string;
  startOutputStreaming(sessionName: string, callback: (data: string) => void, pollIntervalMs?: number): void;
  stopOutputStreaming(sessionName: string): void;
  getPanePid(sessionName: string): number | undefined;
  getPaneDimensions(sessionName: string): { cols: number; rows: number };
  resize(sessionName: string, cols: number, rows: number): void;
  isPaneAlive(sessionName: string): boolean;
  getPaneExitStatus(sessionName: string): number | undefined;
  destroy(): void;

  static listSessions(prefix?: string): Array<{ name: string; created: string; attached: boolean }>;
}
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `session_started` | `SessionHandle` | Session spawn initiated |
| `session_ready` | `SessionHandle` | Session ready for input (after settle delay) |
| `session_stopped` | `SessionHandle, reason` | Session terminated |
| `session_error` | `SessionHandle, error` | Error occurred |
| `login_required` | `SessionHandle, instructions?, url?` | Auth required |
| `blocking_prompt` | `SessionHandle, promptInfo, autoResponded` | Prompt detected |
| `message` | `SessionMessage` | Parsed message received |
| `question` | `SessionHandle, question` | Question detected |
| `stall_detected` | `SessionHandle, recentOutput, stallDurationMs` | Output stalled, needs classification |
| `task_complete` | `SessionHandle` | Agent finished task, returned to idle |

### SpawnConfig

```typescript
interface SpawnConfig {
  id?: string;                          // Auto-generated if not provided
  name: string;                         // Human-readable name
  type: string;                         // Adapter type
  workdir?: string;                     // Working directory
  env?: Record<string, string>;         // Environment variables
  cols?: number;                        // Terminal columns (default: 120)
  rows?: number;                        // Terminal rows (default: 40)
  timeout?: number;                     // Session timeout in ms
  readySettleMs?: number;               // Override adapter's ready settle delay
  stallTimeoutMs?: number;              // Override stall timeout for this session
  traceTaskCompletion?: boolean;        // Verbose completion trace logs (default: false)
  inheritProcessEnv?: boolean;          // Inherit parent process env (default: true)
}
```

### SessionHandle

```typescript
interface SessionHandle {
  id: string;
  name: string;
  type: string;
  status: SessionStatus;
  pid?: number;
  startedAt?: Date;
  lastActivityAt?: Date;
  tmuxSessionName?: string;             // For reconnection / tmux attach
}

type SessionStatus =
  | 'pending'
  | 'starting'
  | 'authenticating'
  | 'ready'
  | 'busy'
  | 'stopping'
  | 'stopped'
  | 'error';
```

## Special Keys

Send special key sequences to sessions. Keys are mapped to tmux key names internally.

```typescript
// Send single key
session.sendKeys('ctrl+c');  // Interrupt
session.sendKeys('ctrl+d');  // EOF

// Send multiple keys
session.sendKeys(['up', 'up', 'enter']);  // Navigate history

// Navigation
session.sendKeys('home');        // Start of line
session.sendKeys('end');         // End of line
```

**Supported keys:**

| Category | Examples |
|----------|----------|
| Ctrl+letter | `ctrl+a` through `ctrl+z` |
| Navigation | `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown` |
| Shift+Nav | `shift+up`, `shift+down`, `shift+left`, `shift+right`, `shift+tab` |
| Editing | `enter`, `tab`, `backspace`, `delete`, `insert`, `escape`, `space` |
| Function | `f1` through `f12` |

### TMUX_KEY_MAP

Access the full key mapping for reference:

```typescript
import { TMUX_KEY_MAP } from 'tmux-manager';

console.log(TMUX_KEY_MAP['ctrl+c']);   // 'C-c'
console.log(TMUX_KEY_MAP['enter']);    // 'Enter'
console.log(TMUX_KEY_MAP['up']);       // 'Up'
```

## Auto-Response Rules

Automatically handle known prompts without human intervention.

```typescript
interface AutoResponseRule {
  pattern: RegExp;
  type: BlockingPromptType;
  response: string;
  responseType?: 'text' | 'keys';
  keys?: string[];
  description: string;
  safe?: boolean;
  once?: boolean;
}
```

**Text response** — sends text + Enter:

```typescript
{ pattern: /create new file\?/i, type: 'permission', response: 'y', description: 'Allow file creation' }
```

**Key sequence response** — sends key presses for TUI menus:

```typescript
{ pattern: /update available/i, type: 'config', response: '', responseType: 'keys', keys: ['down', 'enter'], description: 'Skip update', once: true }
```

## Ready Detection

When `detectReady()` first matches during startup, the session waits for output to settle (default: 100ms) before emitting `session_ready`. This prevents sending input while a TUI is still rendering.

```typescript
class MyCLIAdapter extends BaseCLIAdapter {
  readonly readySettleMs = 500; // Slower TUI — wait longer
  // ...
}

// Or override per-spawn
const handle = await manager.spawn({
  name: 'agent',
  type: 'my-cli',
  readySettleMs: 1000,
});
```

## Stall Detection & Task Completion

### Stall Detection

Content-based stall detection monitors sessions for output that stops changing. When a stall is detected, the `stall_detected` event fires for external classification.

```typescript
const manager = new TmuxManager({
  stallDetectionEnabled: true,
  stallTimeoutMs: 15000,
  onStallClassify: async (sessionId, output, stallDurationMs) => {
    return {
      type: 'blocking_prompt',
      confidence: 0.9,
      suggestedResponse: 'keys:enter',
      reasoning: 'Dialog detected',
    };
  },
});
```

Stall backoff doubles exponentially (8s -> 16s -> 30s cap) when the classifier returns `still_working`, and resets when new content arrives.

### Task Completion Fast-Path

Adapters can implement `detectTaskComplete()` to recognize completion patterns without invoking an LLM classifier:

```typescript
class MyCLIAdapter extends BaseCLIAdapter {
  detectTaskComplete(output: string): boolean {
    return /completed in \d+s/.test(output) && /my-cli>/.test(output);
  }
}
```

### Loading Pattern Suppression

Adapters can implement `detectLoading()` to suppress stall detection during active work:

```typescript
class MyCLIAdapter extends BaseCLIAdapter {
  detectLoading(output: string): boolean {
    return /thinking|reading files/i.test(output);
  }
}
```

## Built-in Adapters

### ShellAdapter

```typescript
import { ShellAdapter } from 'tmux-manager';

const adapter = new ShellAdapter({
  shell: '/bin/zsh',  // Default: $SHELL or /bin/bash
  prompt: 'pty> ',    // Default: 'pty> '
});
```

The shell adapter automatically configures the shell to use the specified prompt (sets both `PS1` and `PROMPT` for bash/zsh compatibility, and passes `--norc`/`-f` flags to prevent rc files from overriding it).

## Architecture

```
TmuxManager           — Multi-session orchestration, events, orphan management
  └─ TmuxSession      — State machine, detection logic, I/O
       └─ TmuxTransport — Low-level tmux CLI wrapper (execSync)
            └─ tmux    — System binary (new-session, send-keys, capture-pane)
```

**Output streaming** uses `capture-pane` polling at 100ms intervals. Each poll captures the current pane content, diffs against the previous capture, and emits only new data. This is more reliable than `pipe-pane` and works consistently across platforms.

**Exit detection** uses `remain-on-exit` with polling of `#{pane_dead}` at 1-second intervals.

**Key mapping** translates key names (e.g., `ctrl+c`, `enter`, `up`) to tmux key names (e.g., `C-c`, `Enter`, `Up`) via `TMUX_KEY_MAP`.

## Blocking Prompt Types

| Type | Description |
|------|-------------|
| `login` | Authentication required |
| `update` | Update/upgrade available |
| `config` | Configuration choice needed |
| `tos` | Terms of service acceptance |
| `model_select` | Model/version selection |
| `project_select` | Project/workspace selection |
| `permission` | Permission request |
| `unknown` | Unrecognized prompt |

## License

MIT
