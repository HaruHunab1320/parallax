# pty-manager

PTY session manager with lifecycle management, pluggable adapters, and blocking prompt detection.

## Features

- **Multi-session management** - Spawn and manage multiple PTY sessions concurrently
- **Pluggable adapters** - Built-in shell adapter, easy to create custom adapters for Docker, SSH, or any CLI tool
- **Blocking prompt detection** - Detect login prompts, confirmations, and interactive prompts
- **Auto-response rules** - Automatically respond to known prompts
- **Terminal attachment** - Attach to sessions for raw I/O streaming
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
