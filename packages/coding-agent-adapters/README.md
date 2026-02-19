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

### Task Completion Detection

Each adapter implements `detectTaskComplete(output)` to recognize when the CLI has finished a task and returned to its idle prompt. This is more specific than `detectReady()` — it matches high-confidence completion indicators (duration summaries, explicit done messages) that short-circuit the LLM stall classifier in pty-manager.

| Adapter | Completion Indicators | Source Patterns |
|---------|----------------------|----------------|
| Claude | Turn duration (`Cooked for 3m 12s`, custom verb) + `❯` prompt (tolerates trailing status bar) | `claude_completed_turn_duration` |
| Gemini | `◇ Ready` window title, `Type your message` composer | `gemini_ready_title` |
| Codex | `Worked for 1m 05s` separator + `›` prompt | `codex_completed_worked_for_separator`, `codex_ready_prompt` |
| Aider | `Aider is waiting for your input`, mode prompts with edit/cost markers | `aider_completed_llm_response_ready` |

```typescript
const claude = new ClaudeAdapter();
claude.detectTaskComplete('Cooked for 3m 12s\n❯ ');  // true
claude.detectTaskComplete('Reading 5 files…');         // false

const aider = new AiderAdapter();
aider.detectTaskComplete('Applied edit to main.ts\nTokens: 1234\ncode> ');  // true
aider.detectTaskComplete('Waiting for claude-sonnet-4-20250514');            // false
```

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

## Workspace Files & Memory

Each coding agent CLI has its own convention for project-level memory files (instructions the agent reads on startup) and config files. Adapters expose this knowledge so orchestration systems can write context to the correct files before spawning an agent.

### Discovering Workspace Files

```typescript
import { ClaudeAdapter, AiderAdapter } from 'coding-agent-adapters';

const claude = new ClaudeAdapter();
claude.getWorkspaceFiles();
// [
//   { relativePath: 'CLAUDE.md', type: 'memory', autoLoaded: true, format: 'markdown', ... },
//   { relativePath: '.claude/settings.json', type: 'config', autoLoaded: true, format: 'json', ... },
//   { relativePath: '.claude/commands', type: 'config', autoLoaded: false, format: 'markdown', ... },
// ]

claude.memoryFilePath; // 'CLAUDE.md'

const aider = new AiderAdapter();
aider.memoryFilePath; // '.aider.conventions.md'
```

### Per-Adapter File Mappings

| Adapter | Memory File | Config | Other |
|---------|------------|--------|-------|
| Claude | `CLAUDE.md` | `.claude/settings.json` | `.claude/commands` |
| Gemini | `GEMINI.md` | `.gemini/settings.json` | `.gemini/styles` |
| Codex | `AGENTS.md` | `.codex/config.json` | `codex.md` |
| Aider | `.aider.conventions.md` | `.aider.conf.yml` | `.aiderignore` |

### Writing Memory Files

Use `writeMemoryFile()` to write instructions into a workspace before spawning an agent. Parent directories are created automatically.

```typescript
const adapter = new ClaudeAdapter();

// Write to the adapter's default memory file (CLAUDE.md)
await adapter.writeMemoryFile('/path/to/workspace', `# Project Context
This is a TypeScript monorepo using pnpm workspaces.
Always run tests before committing.
`);

// Append to an existing memory file
await adapter.writeMemoryFile('/path/to/workspace', '\n## Additional Rules\nUse snake_case.\n', {
  append: true,
});

// Write to a custom file (e.g., template-specific context for sub-agents)
await adapter.writeMemoryFile('/path/to/workspace', '# Task-Specific Context\n...', {
  fileName: 'TASK_CONTEXT.md',
});
```

## Approval Presets

Each coding agent CLI has its own config format for controlling tool permissions. The approval preset system provides 4 named levels that translate to the correct per-CLI config files and CLI flags.

### Preset Levels

| Preset | Description | Auto-approve | Require approval | Blocked |
|--------|-------------|-------------|-----------------|---------|
| `readonly` | Read-only. Safe for auditing. | file_read, planning, user_interaction | — | file_write, shell, web, agent |
| `standard` | Standard dev. Reads + web auto, writes/shell prompt. | file_read, planning, user_interaction, web | file_write, shell, agent | — |
| `permissive` | File ops auto-approved, shell still prompts. | file_read, file_write, planning, user_interaction, web, agent | shell | — |
| `autonomous` | Everything auto-approved. Use with sandbox. | all categories | — | — |

### Generating Configs

```typescript
import { generateApprovalConfig, listPresets, getPresetDefinition } from 'coding-agent-adapters';

// List all available presets
const presets = listPresets();

// Generate CLI-specific config for a preset
const config = generateApprovalConfig('claude', 'permissive');
// {
//   preset: 'permissive',
//   cliFlags: [],
//   workspaceFiles: [{ relativePath: '.claude/settings.json', content: '...', format: 'json' }],
//   envVars: {},
//   summary: 'Claude Code: File ops auto-approved, shell still prompts.',
// }

// Each CLI gets its own config format
generateApprovalConfig('gemini', 'readonly');   // → .gemini/settings.json + --approval-mode plan
generateApprovalConfig('codex', 'autonomous');  // → .codex/config.json + --full-auto
generateApprovalConfig('aider', 'permissive');  // → .aider.conf.yml + --yes-always
```

### Using Presets with Adapters

When `approvalPreset` is set in `adapterConfig`, the adapter's `getArgs()` automatically appends the correct CLI flags:

```typescript
const session = await manager.spawn({
  name: 'sandboxed-agent',
  type: 'claude',
  workdir: '/path/to/project',
  adapterConfig: {
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    approvalPreset: 'autonomous',
  },
});
```

You can also write the config files to a workspace manually using `writeApprovalConfig()`:

```typescript
const adapter = new ClaudeAdapter();
const writtenFiles = await adapter.writeApprovalConfig('/path/to/workspace', {
  adapterConfig: { approvalPreset: 'permissive' },
});
// writtenFiles: ['/path/to/workspace/.claude/settings.json']
```

### Per-CLI Output

| CLI | Config File | Key Controls |
|-----|------------|--------------|
| Claude Code | `.claude/settings.json` | `permissions.allow`, `permissions.deny`, `sandbox.*` |
| Gemini CLI | `.gemini/settings.json` | `general.defaultApprovalMode`, `tools.allowed`, `tools.exclude` |
| Codex | `.codex/config.json` | `approval_policy`, `sandbox_mode`, `tools.web_search` |
| Aider | `.aider.conf.yml` | `yes-always`, `no-auto-commits` |

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
import type { AgentFileDescriptor, InstallationInfo, ModelRecommendations } from 'coding-agent-adapters';
import type { SpawnConfig, ParsedOutput, LoginDetection, AutoResponseRule } from 'pty-manager';

export class CursorAdapter extends BaseCodingAdapter {
  readonly adapterType = 'cursor';
  readonly displayName = 'Cursor';

  readonly installation: InstallationInfo = {
    command: 'npm install -g cursor-cli',
    docsUrl: 'https://cursor.sh/docs',
  };

  // Set to false if the CLI uses text prompts instead of TUI menus
  override readonly usesTuiMenus = false;

  readonly autoResponseRules: AutoResponseRule[] = [
    { pattern: /accept terms/i, type: 'tos', response: 'y', responseType: 'text', description: 'Accept TOS', safe: true, once: true },
  ];

  getWorkspaceFiles(): AgentFileDescriptor[] {
    return [
      { relativePath: '.cursor/rules', description: 'Project rules', autoLoaded: true, type: 'memory', format: 'markdown' },
    ];
  }

  getRecommendedModels(): ModelRecommendations {
    return { powerful: 'claude-sonnet-4', fast: 'gpt-4o-mini' };
  }

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

  detectTaskComplete(output: string): boolean {
    // High-confidence: task summary + idle prompt
    return /completed in \d+s/.test(output) && /cursor>\s*$/m.test(output);
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
