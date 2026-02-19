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

- **Spawn AI Agents** - Create Claude, Codex, Gemini, or Aider agents
- **Multi-Agent Coordination** - Agents can communicate and collaborate
- **Real-time Logs** - Stream agent terminal output
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
| `provision_workspace` | Provision a git workspace (clone repo, create branch) |
| `finalize_workspace` | Finalize a workspace (push, create PR, cleanup) |
| `cleanup_workspace` | Clean up a provisioned workspace |
| `get_workspace_files` | Get workspace file descriptors for an agent type (e.g. CLAUDE.md, GEMINI.md) |
| `write_workspace_file` | Write an agent instruction/memory file into a workspace |

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
- `logs:read` - Read agent logs
- `health:check` - Health check only
- `workspace:*` - All workspace operations
- `workspace:provision` - Provision workspaces
- `workspace:read` - Read workspace file descriptors
- `workspace:write` - Write workspace files

## Supported Agent Types

| Type | CLI | Description |
|------|-----|-------------|
| `claude` | Claude Code | Anthropic's Claude in CLI mode |
| `codex` | Codex CLI | OpenAI's Codex CLI |
| `gemini` | Gemini CLI | Google's Gemini CLI |
| `aider` | Aider | AI pair programming tool |
| `custom` | Custom | User-defined agent |

## Requirements

- Node.js 18+
- Supported agent CLIs installed (claude, codex, etc.)

## License

MIT
