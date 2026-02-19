# pty-manager

PTY session manager with lifecycle management, pluggable adapters, and blocking prompt detection.

## Features

- **Multi-session management** - Spawn and manage multiple PTY sessions concurrently
- **Pluggable adapters** - Built-in shell adapter, easy to create custom adapters for Docker, SSH, or any CLI tool
- **Blocking prompt detection** - Detect login prompts, confirmations, and interactive prompts
- **Auto-response rules** - Automatically respond to known prompts with text or key sequences
- **TUI menu navigation** - Navigate arrow-key menus via `selectMenuOption()` and key-sequence rules
- **Stall detection** - Content-based stall detection with pluggable external classifiers
- **Task completion detection** - Adapter-level fast-path that short-circuits the LLM stall classifier when the CLI returns to its idle prompt
- **Terminal attachment** - Attach to sessions for raw I/O streaming
- **Special key support** - Send Ctrl, Alt, Shift, and function key combinations via `sendKeys()`
- **Bracketed paste** - Proper paste handling with bracketed paste mode support
- **Bun compatible** - Worker-based adapter for non-Node runtimes like Bun
- **Event-driven** - Rich event system for session lifecycle
- **TypeScript-first** - Full type definitions included

## Installation

```bash
npm install pty-manager
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
| `session_ready` | `SessionHandle` | Session ready for input |
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

## Stall Detection & Task Completion

Content-based stall detection monitors sessions for output that stops changing. The content hash strips the full buffer first, then slices the last 500 characters of the normalized text — this ensures identical visual content always produces the same hash regardless of how many raw escape sequences surround it. The normalization strips ANSI escape codes, TUI spinner characters, and countdown/duration text (e.g. `8m 17s` → constant) so that live timers and TUI redraws don't perpetually reset the stall timer. All detection work (ready, blocking prompt, login, exit, stall) runs in a deferred `setImmediate()` tick so that node-pty's synchronous data delivery cannot starve the event loop — timers and I/O callbacks always get a chance to run between data bursts. The output buffer is capped at 100 KB to prevent unbounded growth during long tasks.

When a stall is detected, the session first tries the adapter's `detectTaskComplete()` fast-path. If the adapter recognizes the output as a completed task (e.g. duration summary + idle prompt), it transitions directly to `ready` and emits `task_complete` — skipping the expensive LLM stall classifier entirely.

If the adapter doesn't recognize the output, the session falls back to emitting `stall_detected` for external classification.

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
