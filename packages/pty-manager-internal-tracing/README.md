# pty-manager-internal-tracing

Internal-only fork of `pty-manager` for tracing/capture experiments and adapter research.

This package is intentionally non-publishable and should only be used in trusted internal environments.

## Internal Capture Mode

This internal fork supports optional PTY interaction capture for adapter research.

`capture` is disabled by default and must be explicitly enabled in `PTYManager` config:

```ts
const manager = new PTYManager({
  capture: {
    enabled: true,
    outputRootDir: '.parallax/pty-captures',
    writeRawEvents: true,
    writeStates: true,
    writeTransitions: true,
    writeLifecycle: true,
  },
});
```

When enabled, the manager emits `interaction_state_changed` events and writes per-session JSONL artifacts for raw events, lifecycle, state classifications, and transitions.

## Features

- **Multi-session management** - Spawn and manage multiple PTY sessions concurrently
- **Pluggable adapters** - Built-in shell adapter, easy to create custom adapters for Docker, SSH, or any CLI tool
- **Blocking prompt detection** - Detect login prompts, confirmations, and interactive prompts
- **Auto-response rules** - Automatically respond to known prompts with text or key sequences
- **TUI menu navigation** - Navigate arrow-key menus via `selectMenuOption()` and key-sequence rules
- **Stall detection** - Content-based stall detection with pluggable external classifiers, loading suppression, and exponential backoff
- **Task completion detection** - Settle-based fast-path that short-circuits the LLM stall classifier when the CLI returns to its idle prompt, resilient to decorative TUI rendering after the prompt
- **Terminal attachment** - Attach to sessions for raw I/O streaming
- **Special key support** - Send Ctrl, Alt, Shift, and function key combinations via `sendKeys()`
- **Bracketed paste** - Proper paste handling with bracketed paste mode support
- **Bun compatible** - Worker-based adapter for non-Node runtimes like Bun
- **Event-driven** - Rich event system for session lifecycle
- **TypeScript-first** - Full type definitions included

## Installation (Workspace/Internal)

```bash
pnpm --filter pty-manager-internal-tracing build
```

**Note:** This package requires `node-pty` which has native dependencies. On some systems you may need build tools:

```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install build-essential

# Windows
npm install --global windows-build-tools
```

On some platforms, `node-pty`'s prebuilt `spawn-helper` binary may lack execute permissions after install. If you see `EACCES` errors when spawning sessions, fix with:

```bash
chmod +x node_modules/node-pty/build/Release/spawn-helper
```

## Quick Start

```typescript
import { PTYManager, ShellAdapter, createAdapter } from 'pty-manager';

// Create manager
const manager = new PTYManager();

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

// Attach terminal for raw I/O
const terminal = manager.attachTerminal(handle.id);
terminal.onData((data) => process.stdout.write(data));
terminal.write('ls -la\n');

// Stop session
await manager.stop(handle.id);
```

## Creating Custom Adapters

### Using the Factory

```typescript
import { createAdapter } from 'pty-manager';

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
import { BaseCLIAdapter } from 'pty-manager';

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

  // Optional: high-confidence task completion detection
  detectTaskComplete(output) {
    return /done in \d+s/.test(output) && /ready>/.test(output);
  }

  // Optional: detect active loading state (suppresses stall detection)
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

### PTYManager

```typescript
class PTYManager extends EventEmitter {
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

  // Terminal access
  attachTerminal(id: string): TerminalAttachment | null;

  // Utilities
  has(id: string): boolean;
  getStatusCounts(): Record<SessionStatus, number>;
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
  id?: string;           // Auto-generated if not provided
  name: string;          // Human-readable name
  type: string;          // Adapter type
  workdir?: string;      // Working directory
  env?: Record<string, string>;  // Environment variables
  cols?: number;         // Terminal columns (default: 120)
  rows?: number;         // Terminal rows (default: 40)
  timeout?: number;      // Session timeout in ms
  readySettleMs?: number; // Override adapter's ready settle delay
  stallTimeoutMs?: number; // Override manager stall timeout for this session
  traceTaskCompletion?: boolean; // Verbose completion trace logs (off by default)
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

### TerminalAttachment

```typescript
interface TerminalAttachment {
  onData: (callback: (data: string) => void) => () => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}
```

## Special Keys & Paste

### sendKeys()

Send special key sequences to a PTY session. Useful for AI agents navigating terminal UIs.

```typescript
import { PTYSession, SPECIAL_KEYS } from 'pty-manager';

// Get the underlying session
const terminal = manager.attachTerminal(handle.id);

// Send single key
session.sendKeys('ctrl+c');  // Interrupt
session.sendKeys('ctrl+d');  // EOF

// Send multiple keys
session.sendKeys(['up', 'up', 'enter']);  // Navigate history

// Navigation
session.sendKeys('ctrl+left');   // Word back
session.sendKeys('ctrl+right');  // Word forward
session.sendKeys('home');        // Start of line
session.sendKeys('end');         // End of line

// Function keys
session.sendKeys('f1');          // Help in many CLIs
session.sendKeys('ctrl+f5');     // Modified function key
```

**Supported Key Categories (130+ keys):**

| Category | Examples |
|----------|----------|
| Ctrl+letter | `ctrl+a` through `ctrl+z` |
| Alt+letter | `alt+a` through `alt+z`, `alt+backspace` |
| Navigation | `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown` |
| Shift+Nav | `shift+up`, `shift+down`, `shift+left`, `shift+right`, `shift+home`, `shift+end` |
| Ctrl+Nav | `ctrl+up`, `ctrl+down`, `ctrl+left`, `ctrl+right`, `ctrl+home`, `ctrl+end` |
| Alt+Nav | `alt+up`, `alt+down`, `alt+left`, `alt+right` |
| Ctrl+Shift+Nav | `ctrl+shift+up`, `ctrl+shift+down`, `ctrl+shift+left`, `ctrl+shift+right` |
| Shift+Alt+Nav | `shift+alt+up`, `shift+alt+down`, `shift+alt+left`, `shift+alt+right` |
| Editing | `enter`, `tab`, `backspace`, `delete`, `insert`, `escape`, `space` |
| Modified Edit | `shift+tab`, `shift+delete`, `ctrl+delete` |
| Function | `f1` through `f12` |
| Shift+Fn | `shift+f1` through `shift+f12` |
| Ctrl+Fn | `ctrl+f1` through `ctrl+f12` |

### paste()

Paste text with optional bracketed paste mode (protects against paste injection attacks).

```typescript
// Paste with bracketed paste mode (default, recommended)
session.paste('const x = 1;\nconst y = 2;');

// Paste without bracketed paste (raw)
session.paste('some text', false);
```

Bracketed paste mode wraps text in escape sequences (`\x1b[200~` ... `\x1b[201~`) that tell the terminal the content is pasted, not typed. Most modern shells handle this correctly.

### SPECIAL_KEYS Export

Access the full key mapping for reference or custom handling:

```typescript
import { SPECIAL_KEYS } from 'pty-manager';

console.log(SPECIAL_KEYS['ctrl+c']);  // '\x03'
console.log(SPECIAL_KEYS['up']);      // '\x1b[A'
console.log(Object.keys(SPECIAL_KEYS).length);  // 130+
```

## Bun Compatibility

Since Bun doesn't fully support Node.js native addons like `node-pty`, this package includes a worker-based solution that spawns a Node.js child process to handle PTY operations.

### BunCompatiblePTYManager

```typescript
import { BunCompatiblePTYManager, isBun } from 'pty-manager';

// Create manager (works from Bun or Node.js)
const manager = new BunCompatiblePTYManager({
  nodePath: 'node',  // Path to Node.js executable
});

// Wait for worker to be ready
await manager.waitForReady();

// Spawn a session
const session = await manager.spawn({
  id: 'my-session',
  name: 'shell',
  type: 'shell',
});

// Listen for output
manager.onSessionData('my-session', (data) => {
  console.log('Output:', data);
});

// Send commands
await manager.send('my-session', 'echo "Hello from Bun!"\n');

// Send special keys
await manager.sendKeys('my-session', 'ctrl+c');

// Paste with bracketed paste mode
await manager.paste('my-session', 'some text');

// Shutdown
await manager.shutdown();
```

### How it works

1. `BunCompatiblePTYManager` spawns a Node.js child process running `pty-worker.js`
2. Commands are sent as JSON over stdin
3. Events (output, ready, exit) come back as JSON over stdout
4. The worker uses the full `PTYManager` internally

### Worker Protocol

Commands (stdin → worker):
- `{ "cmd": "spawn", "id": "...", "config": {...} }`
- `{ "cmd": "send", "id": "...", "data": "..." }`
- `{ "cmd": "sendKeys", "id": "...", "keys": ["ctrl+c"] }`
- `{ "cmd": "selectMenuOption", "id": "...", "optionIndex": 2 }`
- `{ "cmd": "addRules", "id": "...", "rules": [...] }`
- `{ "cmd": "clearRules", "id": "..." }`
- `{ "cmd": "kill", "id": "..." }`
- `{ "cmd": "list" }`
- `{ "cmd": "shutdown" }`

Events (worker → stdout):
- `{ "event": "output", "id": "...", "data": "..." }`
- `{ "event": "ready", "id": "..." }`
- `{ "event": "exit", "id": "...", "code": 0 }`
- `{ "event": "blocking_prompt", "id": "...", "promptInfo": {...}, "autoResponded": true }`
- `{ "event": "login_required", "id": "...", "instructions": "..." }`

## Built-in Adapters

### ShellAdapter

Basic shell adapter for bash/zsh sessions.

```typescript
import { ShellAdapter } from 'pty-manager';

const adapter = new ShellAdapter({
  shell: '/bin/zsh',  // default: $SHELL or /bin/bash
  prompt: 'pty> ',    // default: 'pty> '
});
```

## Auto-Response Rules

Auto-response rules let adapters automatically handle known prompts. Rules support two response modes: **text** (for traditional `[y/n]` prompts) and **keys** (for TUI arrow-key menus).

```typescript
interface AutoResponseRule {
  pattern: RegExp;              // Pattern to match in output
  type: BlockingPromptType;     // Prompt category
  response: string;             // Text to send (for responseType: 'text')
  responseType?: 'text' | 'keys';  // How to deliver (default: 'text')
  keys?: string[];              // Key names for responseType: 'keys'
  description: string;          // Human-readable description
  safe?: boolean;               // Whether safe to auto-respond (default: true)
  once?: boolean;               // Fire at most once per session
}
```

**Text response** — sends `response + '\r'` via raw write (for CLIs like Aider that use `[y/n]` prompts):

```typescript
{ pattern: /create new file\?/i, type: 'permission', response: 'y', responseType: 'text', description: 'Allow file creation', safe: true }
```

**Key sequence response** — sends key presses via `sendKeys()` (for TUI menus in Codex, Gemini, Claude):

```typescript
{ pattern: /update available/i, type: 'config', response: '', responseType: 'keys', keys: ['down', 'enter'], description: 'Skip update (select second option)', safe: true, once: true }
```

### TUI Menu Navigation

Adapters can declare `usesTuiMenus: true` to indicate they use arrow-key menus instead of text prompts. When set, rules without an explicit `responseType` default to sending Enter via `sendKeys()` instead of raw text.

```typescript
// Navigate to the Nth option in a TUI menu (0-indexed)
await session.selectMenuOption(2);  // Sends Down, Down, Enter with 50ms delays
```

## Ready Detection Settle Delay

When an adapter's `detectReady()` first matches during startup, `session_ready` is **not** emitted immediately. Instead, the session waits for output to go quiet for `readySettleMs` (default: 100ms) before firing the event. This prevents the orchestrator from sending input while a TUI agent is still rendering (status bar, keyboard shortcuts, update notices).

Adapters can override `readySettleMs` to tune the delay for their CLI's rendering speed. If new output arrives during the settle window, the timer resets. If the ready indicator disappears (e.g. a blocking prompt appears), the settle is cancelled.

```typescript
class MyCLIAdapter extends BaseCLIAdapter {
  // Heavy TUI rendering — wait longer before declaring ready
  readonly readySettleMs = 500;
  // ...
}
```

The settle delay can also be overridden per-spawn via `SpawnConfig.readySettleMs`, which takes precedence over the adapter default. This lets orchestrators tune the delay for varying environments (CI, remote containers, local dev) without forking adapters:

```typescript
const handle = await manager.spawn({
  name: 'agent',
  type: 'claude',
  readySettleMs: 1000, // Slow CI environment — wait longer
});
```

## Stall Detection & Task Completion

Content-based stall detection monitors sessions for output that stops changing. The content hash strips the full buffer first, then slices the last 500 characters of the normalized text — this ensures identical visual content always produces the same hash regardless of how many raw escape sequences surround it. The normalization strips ANSI escape codes, carriage returns (`\r`), non-breaking spaces (`\xa0`), TUI spinner characters, and countdown/duration text (e.g. `8m 17s` → constant) so that live timers, TUI line-overwrites, and redraws don't perpetually reset the stall timer. All detection work (ready, blocking prompt, login, exit, stall) runs in a deferred `setImmediate()` tick so that node-pty's synchronous data delivery cannot starve the event loop — timers and I/O callbacks always get a chance to run between data bursts. The output buffer is capped at 100 KB to prevent unbounded growth during long tasks.

### Task Completion Fast-Path (Settle Pattern)

When a busy session's output matches the adapter's task-complete signal (`detectTaskComplete()` when implemented, otherwise `detectReady()`), a `task_complete` debounce timer starts. TUI agents like Claude Code continue rendering decorative output after the prompt — update notices, shortcut hints, status bar updates. Instead of cancelling the timer on each new data chunk (which would prevent the event from ever firing), the session uses a **settle pattern**: the debounce timer resets on each new chunk but is never cancelled. The timer callback re-verifies the same task-complete signal before transitioning, so stale triggers are safe.

This mirrors the `readySettlePending` pattern used for startup ready detection, and ensures the `task_complete` event fires reliably even when TUI chrome continues rendering after the agent has finished its task.

If the fast-path timer doesn't fire (e.g. the prompt indicator disappears from the buffer), the session falls back to stall detection which emits `stall_detected` for external classification.

### Task Completion Trace Logs (Claude-focused)

`PTYSession` now emits structured debug logs with message `"Task completion trace"` at each completion transition point:

- `busy_signal`
- `debounce_schedule`
- `debounce_fire`
- `debounce_reject_status`
- `debounce_reject_signal`
- `transition_ready`

Tracing is off by default. Enable per session:

```typescript
const handle = await manager.spawn({
  name: 'agent',
  type: 'claude',
  traceTaskCompletion: true,
});
```

Each trace includes detection booleans (`detectTaskComplete`, `detectReady`, `detectLoading`) and a normalized tail hash/snippet to correlate against PTY output captures.

### Completion Confidence Timeline Utility

Use the exported helpers to turn raw trace logs into a per-turn confidence timeline:

```typescript
import {
  extractTaskCompletionTraceRecords,
  buildTaskCompletionTimeline,
} from 'pty-manager';

const records = extractTaskCompletionTraceRecords(mixedLogEntries);
const timeline = buildTaskCompletionTimeline(records, { adapterType: 'claude' });

console.log(timeline.turns);
```

The timeline classifies each trace step as:

- `active`
- `active_loading`
- `likely_complete`
- `rejected`
- `completed`

```typescript
// Enable stall detection with a pluggable classifier
const session = await manager.spawn({
  name: 'agent',
  type: 'claude',
  stallDetection: {
    enabled: true,
    timeoutMs: 15000,
    classify: async (output, stallDurationMs) => {
      // Use an LLM or heuristics to classify the stalled output
      return {
        type: 'blocking_prompt',
        confidence: 0.9,
        suggestedResponse: 'keys:enter',  // or plain text like 'y'
        reasoning: 'Trust folder dialog detected',
      };
    },
  },
});
```

### Adapter-Level Task Completion (Fast Path)

Adapters can implement `detectTaskComplete(output)` to recognize high-confidence completion patterns specific to their CLI. This avoids the latency and cost of an LLM classifier call.

```typescript
class MyCLIAdapter extends BaseCLIAdapter {
  // ...

  detectTaskComplete(output: string): boolean {
    // Match CLI-specific patterns that indicate work is done
    return /completed in \d+s/.test(output) && /my-cli>/.test(output);
  }
}
```

The default `BaseCLIAdapter` implementation delegates to `detectReady()`. Coding agent adapters override this with CLI-specific patterns:

| Adapter | Completion Indicators |
|---------|----------------------|
| Claude Code | Turn duration (`Cooked for 3m 12s`) + `❯` prompt |
| Gemini CLI | `◇ Ready` window title, `Type your message` composer |
| Codex | `Worked for 1m 05s` separator + `›` prompt |
| Aider | `Aider is waiting for your input`, mode prompts with edit markers |

### Loading Pattern Suppression

Adapters can implement `detectLoading(output)` to detect when the CLI is actively working — thinking spinners, file reading progress, model streaming indicators. When `detectLoading()` returns `true`, stall detection is suppressed entirely because the agent is provably working, just not producing new visible text.

```typescript
class MyCLIAdapter extends BaseCLIAdapter {
  detectLoading(output: string): boolean {
    // Match loading indicators specific to this CLI
    return /esc to interrupt/i.test(output) || /Reading \d+ files/i.test(output);
  }
}
```

This avoids unnecessary LLM classifier calls during normal operation and prevents false stall alerts when agents are thinking or reading files.

### Stall Backoff

When the external stall classifier returns `still_working` (or `null`), the next stall check interval doubles exponentially instead of repeating at the base rate. This prevents hammering the classifier every few seconds during long-running tasks.

- Base interval: `stallTimeoutMs` (default: 8000ms)
- After each `still_working`: interval doubles (8s → 16s → 30s cap)
- Maximum interval: 30 seconds
- Reset: backoff resets to the base interval whenever new real content arrives (content hash changes)

```
First stall check:  8s → classifier says "still_working"
Second check:      16s → classifier says "still_working"
Third check:       30s → (capped at 30s)
New output arrives:     → backoff resets to 8s
```

## Blocking Prompt Types

The library recognizes these blocking prompt types:

- `login` - Authentication required
- `update` - Update/upgrade available
- `config` - Configuration choice needed
- `tos` - Terms of service acceptance
- `model_select` - Model/version selection
- `project_select` - Project/workspace selection
- `permission` - Permission request
- `unknown` - Unrecognized prompt

## License

MIT
