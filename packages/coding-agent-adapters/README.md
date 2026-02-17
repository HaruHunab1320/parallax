# coding-agent-adapters

CLI adapters for AI coding agents. Works with [pty-manager](https://www.npmjs.com/package/pty-manager) to spawn and manage coding agents like Claude Code, Gemini CLI, OpenAI Codex, and Aider.

## Installation

```bash
npm install coding-agent-adapters pty-manager
```

## Quick Start

```typescript
import { PTYManager, AdapterRegistry } from 'pty-manager';
import { ClaudeAdapter, GeminiAdapter, AiderAdapter } from 'coding-agent-adapters';

// Create adapter registry and register the adapters you need
const registry = new AdapterRegistry();
registry.register(new ClaudeAdapter());
registry.register(new GeminiAdapter());
registry.register(new AiderAdapter());

// Create PTY manager with the registry
const manager = new PTYManager({ adapters: registry });

// Spawn a Claude Code session
const session = await manager.spawn({
  name: 'code-assistant',
  type: 'claude',
  workdir: '/path/to/project',
  adapterConfig: {
    anthropicKey: process.env.ANTHROPIC_API_KEY,
  },
});

// Listen for output
session.on('output', (data) => console.log(data));

// Send a task
session.send('Help me refactor this function to use async/await');
```

## Available Adapters

| Adapter | CLI | Type | Install Command |
|---------|-----|------|-----------------|
| `ClaudeAdapter` | Claude Code | `claude` | `npm install -g @anthropic-ai/claude-code` |
| `GeminiAdapter` | Gemini CLI | `gemini` | `npm install -g @anthropics/gemini-cli` |
| `CodexAdapter` | OpenAI Codex | `codex` | `npm install -g @openai/codex` |
| `AiderAdapter` | Aider | `aider` | `pip install aider-chat` |

## Preflight Check

Before spawning agents, check if the required CLIs are installed:

```typescript
import { checkAdapters, checkAllAdapters, printMissingAdapters } from 'coding-agent-adapters';

// Check specific adapters
const results = await checkAdapters(['claude', 'aider']);
for (const result of results) {
  if (result.installed) {
    console.log(`✓ ${result.adapter} v${result.version}`);
  } else {
    console.log(`✗ ${result.adapter} - Install: ${result.installCommand}`);
  }
}

// Check all adapters
const allResults = await checkAllAdapters();

// Print formatted installation instructions for missing tools
await printMissingAdapters(['claude', 'gemini']);
```

Each adapter also provides installation info:

```typescript
import { ClaudeAdapter } from 'coding-agent-adapters';

const claude = new ClaudeAdapter();
console.log(claude.installation);
// {
//   command: 'npm install -g @anthropic-ai/claude-code',
//   alternatives: ['npx @anthropic-ai/claude-code', 'brew install claude-code'],
//   docsUrl: 'https://docs.anthropic.com/en/docs/claude-code',
//   minVersion: '1.0.0'
// }

// Get formatted instructions
console.log(claude.getInstallInstructions());
```

## Passing Credentials

You can pass API keys either via environment variables or through `adapterConfig`:

```typescript
// Via environment variables (recommended for production)
process.env.ANTHROPIC_API_KEY = 'sk-ant-...';

const session = await manager.spawn({
  name: 'claude-agent',
  type: 'claude',
  workdir: '/project',
});

// Via adapterConfig (useful for multi-tenant scenarios)
const session = await manager.spawn({
  name: 'claude-agent',
  type: 'claude',
  workdir: '/project',
  adapterConfig: {
    anthropicKey: 'sk-ant-...',
  },
});
```

## Adapter Features

### Auto-Response Rules

Each adapter includes auto-response rules for common prompts (updates, telemetry, etc.):

```typescript
const claude = new ClaudeAdapter();
console.log(claude.autoResponseRules);
// [
//   { pattern: /update available.*\[y\/n\]/i, response: 'n', ... },
//   { pattern: /telemetry.*\[y\/n\]/i, response: 'n', ... },
//   ...
// ]
```

### Blocking Prompt Detection

Adapters detect blocking prompts that require user intervention:

```typescript
session.on('blocking_prompt', (promptInfo, autoResponded) => {
  if (!autoResponded) {
    console.log(`User action required: ${promptInfo.type}`);
    console.log(promptInfo.instructions);
  }
});
```

### Login Detection

Adapters detect when authentication is required:

```typescript
session.on('login_required', (instructions, url) => {
  console.log('Authentication required:', instructions);
  if (url) {
    console.log('Open:', url);
  }
});
```

## Creating Custom Adapters

Extend `BaseCodingAdapter` to create adapters for other coding CLIs:

```typescript
import { BaseCodingAdapter } from 'coding-agent-adapters';
import type { SpawnConfig, ParsedOutput, LoginDetection } from 'pty-manager';

export class CursorAdapter extends BaseCodingAdapter {
  readonly adapterType = 'cursor';
  readonly displayName = 'Cursor';

  getCommand(): string {
    return 'cursor';
  }

  getArgs(config: SpawnConfig): string[] {
    return ['--cli'];
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    return {};
  }

  detectLogin(output: string): LoginDetection {
    // Implement login detection
    return { required: false };
  }

  detectReady(output: string): boolean {
    return output.includes('Cursor ready');
  }

  parseOutput(output: string): ParsedOutput | null {
    // Implement output parsing
    return null;
  }

  getPromptPattern(): RegExp {
    return /cursor>\s*$/;
  }
}
```

## Convenience Functions

```typescript
import { createAllAdapters, createAdapter, ADAPTER_TYPES } from 'coding-agent-adapters';

// Create all adapters at once
const allAdapters = createAllAdapters();

// Create a specific adapter
const claude = createAdapter('claude');

// Available adapter types
console.log(Object.keys(ADAPTER_TYPES)); // ['claude', 'gemini', 'codex', 'aider']
```

## License

MIT
