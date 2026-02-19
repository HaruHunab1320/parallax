# coding-agent-adapters

CLI adapters for AI coding agents. Works with [pty-manager](https://www.npmjs.com/package/pty-manager) to spawn and manage coding agents like Claude Code, Gemini CLI, OpenAI Codex, and Aider.

Each adapter provides source-derived detection patterns for the full session lifecycle: login/auth, blocking prompts, ready state, exit conditions, and auto-response rules — all based on deep analysis of each CLI's open-source codebase.

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

| Adapter | CLI | Type | Input Style | Auto-Response Rules |
|---------|-----|------|-------------|---------------------|
| `ClaudeAdapter` | Claude Code | `claude` | TUI menus | 5 rules |
| `GeminiAdapter` | Gemini CLI | `gemini` | TUI menus | 3 rules |
| `CodexAdapter` | OpenAI Codex | `codex` | TUI menus | 6 rules |
| `AiderAdapter` | Aider | `aider` | Text `(Y)es/(N)o` | 17 rules |

## Session Lifecycle Detection

Each adapter implements detection for every stage of a CLI session:

### Login / Auth Detection

Adapters detect various auth states and methods:

```typescript
const adapter = new GeminiAdapter();
const login = adapter.detectLogin(output);
// { required: true, type: 'browser', url: 'https://...', instructions: '...' }
```

| Adapter | Auth Types | Source Files |
|---------|-----------|-------------|
| Claude | API key, OAuth browser | CLI runtime |
| Gemini | Google OAuth, API key entry, auth in-progress | `AuthDialog.tsx`, `ApiAuthDialog.tsx`, `AuthInProgress.tsx` |
| Codex | Device code flow, onboarding auth menu | `auth.rs`, `headless_chatgpt_login.rs` |
| Aider | API key missing/invalid, OpenRouter OAuth | `onboarding.py`, `models.py` |

### Ready State Detection

Each adapter knows exactly what "ready for input" looks like:

| Adapter | Ready Indicators | Source |
|---------|-----------------|--------|
| Claude | `$` prompt | CLI runtime |
| Gemini | Prompt glyphs (`>`, `!`, `*`, `(r:)`), composer placeholder | `InputPrompt.tsx`, `Composer.tsx` |
| Codex | `>` glyph, placeholder suggestions | `chat_composer.rs` |
| Aider | `ask>`, `code>`, `architect>`, `help>`, `multi>`, startup banner | `io.py`, `base_coder.py` |

### Blocking Prompt Detection

Adapters detect prompts that block the session and require user action:

| Adapter | Detected Prompts |
|---------|-----------------|
| Claude | Permission requests, update notices |
| Gemini | Folder trust, tool execution, validation dialogs, privacy consent |
| Codex | Directory trust, tool approval, update available, model migration, CWD selection |
| Aider | File operations, shell commands, git init, pip install, destructive operations |

### Exit Detection

Adapters detect when a CLI session has ended:

| Adapter | Exit Conditions |
|---------|----------------|
| Claude | Base exit detection |
| Gemini | Folder trust rejection, logout confirmation |
| Codex | Session end, update completion |
| Aider | Ctrl+C / KeyboardInterrupt, version update requiring restart |

## Auto-Response Rules

Adapters include pre-configured rules to automatically handle known prompts. Rules use two response modes depending on the CLI's input style.

### TUI Menu CLIs (Gemini, Codex, Claude)

These CLIs use arrow-key menus rendered with Ink/Ratatui. Rules send key sequences:

```typescript
const codex = new CodexAdapter();
codex.autoResponseRules;
// [
//   { pattern: /update.?available/i, responseType: 'keys', keys: ['down', 'enter'], once: true, ... },
//   { pattern: /trust.?this.?directory/i, responseType: 'keys', keys: ['enter'], once: true, ... },
//   { pattern: /model.?migration/i, responseType: 'keys', keys: ['enter'], once: true, ... },
//   ...
// ]
```

### Text Prompt CLIs (Aider)

Aider uses plain text `(Y)es/(N)o` prompts via `io.py`. Rules send typed text:

```typescript
const aider = new AiderAdapter();
aider.autoResponseRules;
// [
//   { pattern: /allow collection of anonymous analytics/i, response: 'n', responseType: 'text', once: true, ... },
//   { pattern: /add .+ to the chat\?/i, response: 'y', responseType: 'text', ... },
//   { pattern: /create new file\?/i, response: 'y', responseType: 'text', ... },
//   { pattern: /run shell commands?\?/i, response: 'y', responseType: 'text', ... },
//   ...17 rules total
// ]
```

### The `usesTuiMenus` Flag

Adapters declare their input style via `usesTuiMenus`. This affects how auto-response rules with no explicit `responseType` are delivered:

- `usesTuiMenus: true` (Gemini, Codex, Claude) — defaults to `sendKeys('enter')`
- `usesTuiMenus: false` (Aider) — defaults to `writeRaw(response + '\r')`

## Model Recommendations

Each adapter provides model recommendations based on available credentials:

```typescript
const aider = new AiderAdapter();

aider.getRecommendedModels({ anthropicKey: 'sk-ant-...' });
// { powerful: 'anthropic/claude-sonnet-4-20250514', fast: 'anthropic/claude-haiku-4-5-20251001' }

aider.getRecommendedModels({ googleKey: 'AIza...' });
// { powerful: 'gemini/gemini-3-pro', fast: 'gemini/gemini-3-flash' }
```

## Preflight Check

Before spawning agents, check if the required CLIs are installed:

```typescript
import { checkAdapters, checkAllAdapters, printMissingAdapters } from 'coding-agent-adapters';

// Check specific adapters
const results = await checkAdapters(['claude', 'aider']);
for (const result of results) {
  if (result.installed) {
    console.log(`${result.adapter} v${result.version}`);
  } else {
    console.log(`${result.adapter} - Install: ${result.installCommand}`);
  }
}

// Check all adapters
const allResults = await checkAllAdapters();

// Print formatted installation instructions for missing tools
await printMissingAdapters(['claude', 'gemini']);
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
    openaiKey: 'sk-...',
    googleKey: 'AIza...',
  },
});
```

## Creating Custom Adapters

Extend `BaseCodingAdapter` to create adapters for other coding CLIs:

```typescript
import { BaseCodingAdapter } from 'coding-agent-adapters';
import type { SpawnConfig, ParsedOutput, LoginDetection, AutoResponseRule } from 'pty-manager';

export class CursorAdapter extends BaseCodingAdapter {
  readonly adapterType = 'cursor';
  readonly displayName = 'Cursor';

  // Set to false if the CLI uses text prompts instead of TUI menus
  override readonly usesTuiMenus = false;

  readonly autoResponseRules: AutoResponseRule[] = [
    { pattern: /accept terms/i, type: 'tos', response: 'y', responseType: 'text', description: 'Accept TOS', safe: true, once: true },
  ];

  getCommand(): string { return 'cursor'; }
  getArgs(config: SpawnConfig): string[] { return ['--cli']; }
  getEnv(config: SpawnConfig): Record<string, string> { return {}; }

  detectLogin(output: string): LoginDetection {
    if (/login required/i.test(output)) {
      return { required: true, type: 'browser' };
    }
    return { required: false };
  }

  detectReady(output: string): boolean {
    return /cursor>\s*$/m.test(output);
  }

  parseOutput(output: string): ParsedOutput | null {
    return { type: 'response', content: output.trim(), isComplete: true, isQuestion: output.includes('?') };
  }

  getPromptPattern(): RegExp { return /cursor>\s*$/; }
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
