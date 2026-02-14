# PTY Agent Manager Development Plan

**Package Name:** `@parallax/pty-agent-manager`
**Current Location:** `packages/runtime-local/src/pty/`
**Extraction Difficulty:** Medium
**Estimated Effort:** 2-3 weeks
**Phase:** 2 (Core Components)

## Overview

A comprehensive system for spawning and managing CLI tools via pseudo-terminals (PTY). Features include multi-session lifecycle management, blocking prompt detection, auto-response rules, and a pluggable adapter pattern for different CLI tools.

This is the most unique component - there's no equivalent on npm that provides this level of CLI agent management.

## Current Implementation

```
packages/runtime-local/src/pty/
├── pty-manager.ts       # 377 lines - Multi-session lifecycle
├── pty-session.ts       # 424 lines - Individual sessions
└── adapters/
    ├── base-adapter.ts  # 232 lines - Abstract adapter
    ├── claude-adapter.ts
    ├── codex-adapter.ts
    ├── echo-adapter.ts
    └── ...
```

### Core Classes

```typescript
// PTYManager - Orchestrates multiple PTY sessions
export class PTYManager extends EventEmitter {
  async spawn(config: AgentConfig): Promise<AgentHandle>
  async stop(agentId: string, options?: StopOptions): Promise<void>
  async list(filter?: AgentFilter): Promise<AgentHandle[]>
  async send(agentId: string, message: string): Promise<AgentMessage>
  async *logs(agentId: string, options?: LogOptions): AsyncIterable<string>
  attachTerminal(agentId: string): TerminalAttachment | null
}

// PTYSession - Single PTY session with smart detection
export class PTYSession extends EventEmitter {
  async start(): Promise<void>
  send(message: string): AgentMessage
  private detectAndHandleBlockingPrompt(): boolean
  private tryAutoResponse(): boolean
}

// BaseCLIAdapter - Plugin interface for CLI tools
export abstract class BaseCLIAdapter {
  abstract getCommand(): string
  abstract getArgs(config: AgentConfig): string[]
  abstract parseOutput(output: string): ParsedOutput | null
  detectBlockingPrompt(output: string): BlockingPromptDetection
  async validateInstallation(): Promise<InstallationStatus>
}
```

## Target API

```typescript
// @parallax/pty-agent-manager

import {
  PTYManager,
  PTYSession,
  BaseCLIAdapter,
  ShellAdapter,
  createAdapter
} from '@parallax/pty-agent-manager';

// Create manager with adapters
const manager = new PTYManager({
  adapters: {
    shell: new ShellAdapter(),
    claude: createAdapter({
      command: 'claude',
      args: ['--no-banner'],
      loginDetection: {
        patterns: [/please log in/i, /authentication required/i],
        extractUrl: (output) => output.match(/https:\/\/[^\s]+/)?.[0]
      },
      blockingPrompts: [
        { pattern: /\[Y\/n\]/i, autoResponse: 'Y' },
        { pattern: /continue\?/i, autoResponse: 'yes' }
      ],
      readyIndicators: [/ready/i, /\$ $/]
    })
  },
  defaults: {
    shell: process.env.SHELL || '/bin/bash',
    timeout: 30000,
    maxSessions: 10
  }
});

// Spawn a CLI session
const handle = await manager.spawn({
  name: 'my-agent',
  type: 'claude',
  workdir: '/path/to/project',
  env: { CLAUDE_API_KEY: '...' }
});

// Send messages
const response = await manager.send(handle.id, 'Write a hello world function');

// Stream logs
for await (const line of manager.logs(handle.id)) {
  console.log(line);
}

// Attach terminal for real-time interaction
const terminal = manager.attachTerminal(handle.id);
terminal.onData((data) => process.stdout.write(data));
terminal.write('ls -la\n');
terminal.resize(120, 40);

// Listen for events
manager.on('agent:ready', ({ id, type }) => {});
manager.on('agent:login_required', ({ id, loginUrl }) => {});
manager.on('agent:blocking_prompt', ({ id, prompt, autoResponded }) => {});
manager.on('agent:output', ({ id, data }) => {});
manager.on('agent:exit', ({ id, code }) => {});

// Stop session
await manager.stop(handle.id, { force: false, timeout: 5000 });
```

## Development Phases

### Phase 1: Core Extraction (Week 1)

#### Day 1-2: Setup & Base Classes
- [ ] Create package structure
- [ ] Extract `PTYManager` class
- [ ] Extract `PTYSession` class
- [ ] Remove Parallax-specific imports
- [ ] Create standalone type definitions

#### Day 3-4: Adapter System
- [ ] Extract `BaseCLIAdapter` abstract class
- [ ] Create `AdapterRegistry` for registration
- [ ] Implement `ShellAdapter` (bash/zsh)
- [ ] Create `createAdapter()` factory function
- [ ] Add adapter validation

#### Day 5: Events & Lifecycle
- [ ] Standardize event names and payloads
- [ ] Add session state machine
- [ ] Implement graceful shutdown
- [ ] Add health monitoring

### Phase 2: Features (Week 2)

#### Day 1-2: Blocking Prompt System
- [ ] Extract prompt detection logic
- [ ] Create configurable pattern matching
- [ ] Add auto-response rules
- [ ] Add prompt timeout handling
- [ ] Add manual response API

#### Day 3-4: Login Detection
- [ ] Extract login detection system
- [ ] Add URL extraction from output
- [ ] Add authentication state tracking
- [ ] Add callback for auth completion

#### Day 5: Terminal Attachment
- [ ] Extract terminal attachment API
- [ ] Add resize support
- [ ] Add bidirectional data streaming
- [ ] Add terminal detach handling

### Phase 3: Testing & Polish (Week 3)

#### Day 1-2: Unit Tests
- [ ] Test PTYManager lifecycle
- [ ] Test PTYSession operations
- [ ] Test adapter system
- [ ] Test blocking prompt detection
- [ ] Test auto-response rules

#### Day 3: Integration Tests
- [ ] Test with real shell commands
- [ ] Test concurrent sessions
- [ ] Test terminal attachment
- [ ] Test cleanup on errors

#### Day 4-5: Documentation & Publish
- [ ] Write comprehensive README
- [ ] Create adapter development guide
- [ ] Add examples for common CLIs
- [ ] Configure npm publish
- [ ] Publish v1.0.0

## Package Structure

```
@parallax/pty-agent-manager/
├── src/
│   ├── index.ts                    # Public exports
│   ├── pty-manager.ts              # Multi-session manager
│   ├── pty-session.ts              # Individual session
│   ├── types.ts                    # TypeScript interfaces
│   ├── state-machine.ts            # Session states
│   ├── adapters/
│   │   ├── index.ts                # Adapter exports
│   │   ├── base-adapter.ts         # Abstract base class
│   │   ├── adapter-registry.ts     # Registration system
│   │   ├── adapter-factory.ts      # createAdapter()
│   │   └── shell-adapter.ts        # Built-in shell adapter
│   ├── detection/
│   │   ├── blocking-prompt.ts      # Prompt detection
│   │   ├── login-detector.ts       # Auth detection
│   │   └── ready-detector.ts       # Ready state detection
│   └── terminal/
│       ├── terminal-attachment.ts  # Terminal API
│       └── terminal-resize.ts      # Resize handling
├── tests/
│   ├── pty-manager.test.ts
│   ├── pty-session.test.ts
│   ├── adapters/
│   │   ├── base-adapter.test.ts
│   │   └── shell-adapter.test.ts
│   ├── detection/
│   │   └── blocking-prompt.test.ts
│   └── integration/
│       ├── full-workflow.test.ts
│       └── concurrent-sessions.test.ts
├── examples/
│   ├── basic-shell.ts
│   ├── custom-adapter.ts
│   ├── blocking-prompts.ts
│   ├── terminal-ui.ts
│   └── adapters/
│       ├── claude-adapter.ts
│       ├── codex-adapter.ts
│       └── git-adapter.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## API Reference

### `PTYManager`

```typescript
class PTYManager extends EventEmitter {
  constructor(config: PTYManagerConfig)

  /** Spawn a new PTY session */
  spawn(config: SpawnConfig): Promise<AgentHandle>

  /** Stop a session */
  stop(id: string, options?: StopOptions): Promise<void>

  /** Stop all sessions */
  stopAll(options?: StopOptions): Promise<void>

  /** Get session by ID */
  get(id: string): AgentHandle | null

  /** List all sessions */
  list(filter?: SessionFilter): AgentHandle[]

  /** Send message to session */
  send(id: string, message: string): Promise<SendResult>

  /** Stream session logs */
  logs(id: string, options?: LogOptions): AsyncIterable<string>

  /** Attach terminal to session */
  attachTerminal(id: string): TerminalAttachment | null

  /** Shutdown manager */
  shutdown(): Promise<void>
}
```

### `SpawnConfig`

```typescript
interface SpawnConfig {
  /** Unique name for this session */
  name: string;

  /** Adapter type to use */
  type: string;

  /** Working directory */
  workdir?: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Initial terminal size */
  cols?: number;
  rows?: number;

  /** Session timeout in ms */
  timeout?: number;

  /** Custom adapter configuration */
  adapterConfig?: Record<string, unknown>;
}
```

### `AgentHandle`

```typescript
interface AgentHandle {
  id: string;
  name: string;
  type: string;
  status: SessionStatus;
  pid?: number;
  startedAt: Date;
  lastActivityAt: Date;
}

type SessionStatus =
  | 'starting'
  | 'login_required'
  | 'authenticating'
  | 'ready'
  | 'busy'
  | 'stopping'
  | 'stopped'
  | 'error';
```

### `BaseCLIAdapter`

```typescript
abstract class BaseCLIAdapter {
  /** Get the command to execute */
  abstract getCommand(): string;

  /** Get command arguments */
  abstract getArgs(config: SpawnConfig): string[];

  /** Parse structured output from raw text */
  abstract parseOutput(output: string): ParsedOutput | null;

  /** Detect blocking prompts in output */
  detectBlockingPrompt(output: string): BlockingPromptDetection | null;

  /** Detect login/auth requirements */
  detectLoginRequired(output: string): LoginDetection | null;

  /** Detect when CLI is ready for input */
  detectReady(output: string): boolean;

  /** Get auto-response for a prompt */
  getAutoResponse(prompt: string): string | null;

  /** Validate CLI installation */
  validateInstallation(): Promise<InstallationStatus>;
}
```

### `createAdapter` Factory

```typescript
function createAdapter(config: AdapterConfig): BaseCLIAdapter;

interface AdapterConfig {
  /** Command to execute */
  command: string;

  /** Default arguments */
  args?: string[];

  /** Login detection configuration */
  loginDetection?: {
    patterns: RegExp[];
    extractUrl?: (output: string) => string | null;
  };

  /** Blocking prompt configuration */
  blockingPrompts?: Array<{
    pattern: RegExp;
    autoResponse?: string;
  }>;

  /** Ready state indicators */
  readyIndicators?: RegExp[];

  /** Output parser */
  parseOutput?: (output: string) => ParsedOutput | null;
}
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `session:starting` | `{ id, type, name }` | Session spawn initiated |
| `session:ready` | `{ id, type }` | Session ready for input |
| `session:login_required` | `{ id, loginUrl? }` | Auth required |
| `session:authenticated` | `{ id }` | Auth completed |
| `session:blocking_prompt` | `{ id, prompt, autoResponded }` | Prompt detected |
| `session:output` | `{ id, data }` | Raw output data |
| `session:message` | `{ id, message }` | Parsed message |
| `session:error` | `{ id, error }` | Error occurred |
| `session:exit` | `{ id, code, signal }` | Session exited |

## Example Adapters

### Claude Code Adapter

```typescript
// examples/adapters/claude-adapter.ts
import { createAdapter } from '@parallax/pty-agent-manager';

export const claudeAdapter = createAdapter({
  command: 'claude',
  args: ['--no-banner', '--dangerously-skip-permissions'],

  loginDetection: {
    patterns: [
      /please log in/i,
      /authentication required/i,
      /not logged in/i
    ],
    extractUrl: (output) => {
      const match = output.match(/https:\/\/console\.anthropic\.com[^\s]*/);
      return match?.[0] || null;
    }
  },

  blockingPrompts: [
    { pattern: /\[Y\/n\]/i, autoResponse: 'Y' },
    { pattern: /continue\?/i, autoResponse: 'yes' },
    { pattern: /overwrite\?/i, autoResponse: 'n' }
  ],

  readyIndicators: [
    /\$ $/,
    /ready for input/i,
    /claude>/i
  ],

  parseOutput: (output) => {
    // Extract structured responses
    const jsonMatch = output.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      return { type: 'json', data: JSON.parse(jsonMatch[1]) };
    }
    return { type: 'text', data: output };
  }
});
```

### Git Adapter

```typescript
// examples/adapters/git-adapter.ts
export const gitAdapter = createAdapter({
  command: 'git',
  args: [],

  blockingPrompts: [
    { pattern: /Username for/, autoResponse: null }, // Require manual
    { pattern: /Password for/, autoResponse: null },
    { pattern: /\(yes\/no\)\?/, autoResponse: 'yes' }
  ],

  readyIndicators: [/\$ $/]
});
```

## Migration Guide

### Before (Parallax Internal)

```typescript
import { PTYManager } from '../pty/pty-manager';
import { ClaudeAdapter } from '../pty/adapters/claude-adapter';

const manager = new PTYManager(adapters, logger, config);
const handle = await manager.spawn({
  id: 'agent-1',
  name: 'claude-agent',
  type: 'claude',
  capabilities: ['coding'],
  workdir: '/project'
});
```

### After (@parallax/pty-agent-manager)

```typescript
import { PTYManager, createAdapter } from '@parallax/pty-agent-manager';

const manager = new PTYManager({
  adapters: {
    claude: createAdapter({ /* ... */ })
  }
});

const handle = await manager.spawn({
  name: 'claude-agent',
  type: 'claude',
  workdir: '/project'
});
```

## Dependencies

**Runtime:**
- `node-pty` ^1.0.0 (native PTY bindings)
- `events` (Node.js built-in)

**Development:**
- `typescript` ^5.0.0
- `vitest` ^2.0.0
- `tsup` (bundling)

## Platform Support

| Platform | Status |
|----------|--------|
| Linux | Full support |
| macOS | Full support |
| Windows | Partial (via ConPTY) |

## Success Criteria

- [ ] Platform-independent core (node-pty handles natives)
- [ ] 90%+ test coverage
- [ ] TypeScript types included
- [ ] Works in Node.js 18+
- [ ] Built-in shell adapter
- [ ] Adapter factory for common patterns
- [ ] Comprehensive event system
- [ ] Terminal attachment API
- [ ] Documentation with examples
