# parallax-agent-runtime

MCP server for AI agent orchestration. Enables AI assistants like Claude to spawn, manage, and coordinate multiple AI agents through the [Model Context Protocol](https://modelcontextprotocol.io).

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "parallax": {
      "command": "npx",
      "args": ["parallax-agent-runtime"]
    }
  }
}
```

Restart Claude Desktop. You can now ask Claude to spawn and manage agents:

> "Spawn a code review agent to analyze my project"

### CLI

```bash
# Run directly
npx parallax-agent-runtime

# Or install globally
npm install -g parallax-agent-runtime
parallax-agent-runtime
```

## Features

- **Spawn AI Agents** - Create Claude, Codex, Gemini, Aider, or Hermes agents
- **Approval Presets** - Unified tool permission control across all CLIs (`readonly`, `standard`, `permissive`, `autonomous`)
- **Multi-Agent Coordination** - Agents can communicate and collaborate
- **Real-time Logs** - Stream agent terminal output
- **Smart Task Completion** - Adapter-level detection short-circuits LLM stall classifier when agents finish tasks
- **Loading Suppression** - Stall detection suppressed when agents are actively working (thinking, reading files, streaming)
- **Stall Backoff** - Exponential backoff (up to 30s) on repeated `still_working` classifications reduces classifier overhead
- **Ready Settle Delay** - Defers input until TUI agents finish rendering, preventing swallowed keystrokes
- **Hook Telemetry** - Deterministic state detection via hook scripts or HTTP callbacks
- **Git Worktrees** - Parallel workspaces sharing `.git` for fast multi-agent workflows
- **Environment Isolation** - `inheritProcessEnv: false` prevents credential leakage to child agents
- **Task Completion Events** - Real-time notifications when agents finish tasks
- **Tool Activity Tracking** - Events when agents run external tools (browser, bash, etc.)
- **Metrics & Health** - Monitor agent resource usage
- **Authentication** - Optional JWT/API key auth for remote access

## MCP Tools

| Tool | Description |
|------|-------------|
| `spawn` | Create and start a new AI agent |
| `stop` | Stop a running agent |
| `list` | List agents with optional filtering |
| `get` | Get detailed agent information |
| `send` | Send a message to an agent |
| `logs` | Get agent terminal output |
| `metrics` | Get agent resource metrics |
| `health` | Check runtime health status |
| `provision_workspace` | Provision a git workspace (clone repo, create branch, optional custom branch name) |
| `finalize_workspace` | Finalize a workspace (push, create PR, cleanup) |
| `cleanup_workspace` | Clean up a provisioned workspace |
| `get_workspace_files` | Get workspace file descriptors for an agent type (e.g. CLAUDE.md, GEMINI.md) |
| `write_workspace_file` | Write an agent instruction/memory file into a workspace |
| `list_presets` | List available approval presets with descriptions and permissions |
| `get_preset_config` | Generate CLI-specific approval config for an agent type and preset |
| `notify_hook_event` | Forward a hook event into an agent session (resets stall timers, signals completion) |
| `write_raw` | Write raw data (escape sequences, control chars) to an agent terminal |
| `get_hook_config` | Get hook telemetry protocol config for an agent type (scripts, settings, HTTP endpoints) |
| `add_worktree` | Add a git worktree to an existing clone workspace for parallel work |
| `list_worktrees` | List all worktrees for a parent workspace |
| `remove_worktree` | Remove a git worktree |

## MCP Resources

| Resource | URI Pattern | Description |
|----------|-------------|-------------|
| Agent State | `agents://{agentId}` | Current agent state as JSON |
| Agent Logs | `logs://{agentId}` | Terminal output stream |

## MCP Prompts

| Prompt | Description |
|--------|-------------|
| `spawn_review_team` | Spawn a coordinated code review team |
| `spawn_dev_agent` | Quick spawn a development agent |

## Examples

### Spawn a Code Review Agent

```
User: "Spawn a code review agent for my project"

Claude uses the spawn tool:
{
  "name": "reviewer",
  "type": "claude",
  "capabilities": ["code_review"],
  "workdir": "/path/to/project"
}
```

### Interactive vs Non-Interactive Mode

By default, agents spawn in **interactive mode** (`interactive: true`), which is required for PTY sessions. This skips flags like `--print` (Claude), `--non-interactive` (Gemini), and `--quiet` (Codex) that are incompatible with PTY.

```
{
  "name": "headless-worker",
  "type": "claude",
  "capabilities": ["code"],
  "interactive": false
}
```

Set `interactive: false` only for piped/headless usage outside a PTY.

### Spawn with an Approval Preset

```
User: "Spawn an autonomous agent in a sandbox"

Claude uses the spawn tool:
{
  "name": "sandboxed-worker",
  "type": "claude",
  "capabilities": ["code", "test"],
  "workdir": "/path/to/project",
  "approvalPreset": "autonomous"
}

This writes .claude/settings.json with sandbox + full auto-approve config,
and adds the appropriate CLI flags (e.g. --tools for Claude, --full-auto for Codex).
```

### Explore Available Presets

```
User: "What approval presets are available?"

Claude uses the list_presets tool → returns:
- readonly: Read-only. Safe for auditing.
- standard: Standard dev. Reads + web auto, writes/shell prompt.
- permissive: File ops auto-approved, shell still prompts.
- autonomous: Everything auto-approved. Use with sandbox.
```

### Provision with a Custom Branch Name

```
User: "Set up a workspace with a specific branch name"

Claude uses the provision_workspace tool:
{
  "repo": "https://github.com/owner/repo",
  "executionId": "exec-123",
  "branchName": "test/claude-nonce-abc123"
}

When branchName is provided, it is used verbatim instead of
auto-generating from executionId/role/slug.
```

### Spawn with Environment Isolation

```
{
  "name": "sandboxed-worker",
  "type": "claude",
  "capabilities": ["code"],
  "workdir": "/path/to/project",
  "inheritProcessEnv": false
}

When inheritProcessEnv is false, the agent process only receives
adapter-specific and explicitly configured env vars — no host
credentials leak into the child process.
```

### Hook Telemetry

```
User: "Set up hook-based state detection for the Claude agent"

Claude uses the get_hook_config tool:
{
  "agentType": "claude",
  "httpUrl": "http://localhost:8080/hooks",
  "sessionId": "session-abc"
}

Returns the hook script, settings.json config, and marker prefix
needed for deterministic agent state detection via hooks instead
of heuristic output parsing.
```

### Git Worktrees for Parallel Work

```
User: "Create parallel workspaces for the review team"

1. Provision the base workspace:
   provision_workspace({ repo: "...", executionId: "exec-1" })

2. Add worktrees for parallel agents:
   add_worktree({
     parentWorkspaceId: "ws-1",
     branch: "main",
     executionId: "exec-1"
   })

Worktrees share the .git directory, making them faster to create
than full clones while providing isolated working directories.
```

### Send a Task to an Agent

```
User: "Ask the reviewer to check the authentication module"

Claude uses the send tool:
{
  "agentId": "reviewer-abc123",
  "message": "Review the authentication module for security issues",
  "expectResponse": true
}
```

### Spawn a Review Team

```
User: "Set up a full code review team"

Claude uses the spawn_review_team prompt with:
{
  "project_dir": "/path/to/project",
  "review_focus": "security"
}

This spawns:
- Architect agent (high-level design review)
- Reviewer agent (detailed code review)
- Test engineer agent (test coverage analysis)
```

## CLI Options

```bash
parallax-agent-runtime [options]

Options:
  --debug           Enable debug logging
  --max-agents=N    Maximum concurrent agents (default: 10)
  --help, -h        Show help
  --version, -v     Show version
```

## Programmatic Usage

```typescript
import { ParallaxAgentRuntime, StdioServerTransport } from 'parallax-agent-runtime';
import pino from 'pino';

const runtime = new ParallaxAgentRuntime({
  logger: pino(),
  maxAgents: 10,
});

const transport = new StdioServerTransport();
await runtime.connect(transport);
```

## Authentication

For remote deployments, enable authentication:

```typescript
const runtime = new ParallaxAgentRuntime({
  logger: pino(),
  auth: {
    // API key authentication
    apiKeys: [
      {
        key: 'plx_your_api_key',
        name: 'my-integration',
        permissions: ['agents:*', 'health:check'],
      },
    ],
    // Or JWT authentication
    jwtSecret: process.env.JWT_SECRET,
    jwtIssuer: 'my-app',
  },
});
```

### Permission Format

Permissions use a colon-separated format with wildcard support:

- `*` - Full access to all operations
- `agents:*` - All agent operations (spawn, stop, list, get, send)
- `agents:spawn` - Only spawn agents
- `agents:hook` - Forward hook events into sessions
- `logs:read` - Read agent logs
- `health:check` - Health check only
- `workspace:*` - All workspace operations
- `workspace:provision` - Provision workspaces
- `workspace:read` - Read workspace file descriptors
- `workspace:write` - Write workspace files
- `presets:*` - All preset operations
- `presets:list` - List available presets
- `presets:read` - Get preset config details

## Supported Agent Types

| Type | CLI | Description |
|------|-----|-------------|
| `claude` | Claude Code | Anthropic's Claude in CLI mode |
| `codex` | Codex CLI | OpenAI's Codex CLI |
| `gemini` | Gemini CLI | Google's Gemini CLI |
| `aider` | Aider | AI pair programming tool |
| `hermes` | Hermes | Hermes agent CLI |
| `custom` | Custom | User-defined agent |

## Requirements

- Node.js 18+
- Supported agent CLIs installed (claude, codex, etc.)

## License

MIT
