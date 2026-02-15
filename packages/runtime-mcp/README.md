# @parallax/runtime-mcp

MCP (Model Context Protocol) server for Parallax Runtime. Enables AI agents to spawn, manage, and communicate with other agents through standardized MCP tools.

## Installation

```bash
pnpm add @parallax/runtime-mcp
```

## Quick Start

### Claude Desktop Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "parallax": {
      "command": "npx",
      "args": ["@parallax/runtime-mcp"]
    }
  }
}
```

### Programmatic Usage

```typescript
import { ParallaxMcpServer, createStdioTransport } from '@parallax/runtime-mcp';
import pino from 'pino';

const logger = pino();
const server = new ParallaxMcpServer({ logger, maxAgents: 10 });
const transport = createStdioTransport();

await server.connect(transport);
```

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

### Example: Spawning an Agent

```
User: "Spawn a code review agent"

Claude (via MCP):
spawn({
  name: "reviewer",
  type: "claude",
  capabilities: ["code_review", "best_practices"],
  workdir: "/path/to/project",
  waitForReady: true
})
```

### Example: Sending a Task

```
send({
  agentId: "abc123",
  message: "Review the authentication module for security issues",
  expectResponse: true,
  timeout: 60000
})
```

## MCP Resources

| Resource | URI Pattern | Description |
|----------|-------------|-------------|
| Agent State | `agents://{agentId}` | Current agent state as JSON |
| Agent Logs | `logs://{agentId}` | Terminal output (supports subscription) |

## MCP Prompts

| Prompt | Description |
|--------|-------------|
| `spawn_review_team` | Spawn architect + reviewer + test engineer team |
| `spawn_dev_agent` | Quick spawn a single development agent |

### Example: Using spawn_review_team

```
Arguments:
- project_dir: /path/to/project
- review_focus: security

Creates a coordinated team:
1. Architect agent for high-level design review
2. Reviewer agent for detailed code review
3. Test engineer agent for test coverage analysis
```

## Authentication

The MCP server supports optional token-based authentication for securing remote access.

### Configuration

```typescript
import { ParallaxMcpServer } from '@parallax/runtime-mcp';

const server = new ParallaxMcpServer({
  logger,
  auth: {
    enabled: true,
    // JWT authentication
    jwt: {
      secret: process.env.JWT_SECRET!,
      algorithm: 'HS256',
      issuer: 'parallax',
      audience: 'parallax-mcp',
    },
    // Or API key authentication
    apiKeys: new Map([
      ['plx_your_api_key_here', {
        name: 'my-integration',
        permissions: ['agents:*', 'health:check'],
      }],
    ]),
  },
});
```

### Authenticating Connections

For HTTP/SSE transports, authenticate before connecting:

```typescript
// From Authorization header
await server.authenticateFromHeader(req.headers.authorization);

// Or directly with token
await server.authenticate(token);

// Then connect
await server.connect(transport);
```

### Permissions

Tools require specific permissions:

| Tool | Permission |
|------|------------|
| spawn | `agents:spawn` |
| stop | `agents:stop` |
| list | `agents:list` |
| get | `agents:get` |
| send | `agents:send` |
| logs | `agents:logs` |
| metrics | `agents:metrics` |
| health | `health:check` |

Roles map to permissions:
- `admin`: All permissions (`*`)
- `operator`: `agents:*`, `executions:*`
- `developer`: `agents:spawn`, `agents:list`, `agents:get`, `agents:send`
- `viewer`: `agents:list`, `agents:get`, `health:check`

## CLI Options

```bash
# Start with debug logging
npx @parallax/runtime-mcp --debug

# Limit maximum concurrent agents
npx @parallax/runtime-mcp --max-agents=5
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Claude Desktop                     │
│                   (MCP Client)                       │
└─────────────────────┬───────────────────────────────┘
                      │ stdio
┌─────────────────────▼───────────────────────────────┐
│              @parallax/runtime-mcp                   │
│  ┌─────────────────────────────────────────────┐    │
│  │           ParallaxMcpServer                  │    │
│  │  ┌────────┐ ┌───────────┐ ┌──────────┐      │    │
│  │  │ Tools  │ │ Resources │ │ Prompts  │      │    │
│  │  └───┬────┘ └─────┬─────┘ └────┬─────┘      │    │
│  └──────┼────────────┼────────────┼────────────┘    │
│         └────────────┼────────────┘                  │
│                      ▼                               │
│  ┌─────────────────────────────────────────────┐    │
│  │            LocalRuntime                      │    │
│  │  ┌──────────────────────────────────────┐   │    │
│  │  │           PTYManager                  │   │    │
│  │  │  ┌─────────┐  ┌─────────┐            │   │    │
│  │  │  │ Claude  │  │  Codex  │  ...       │   │    │
│  │  │  │  Agent  │  │  Agent  │            │   │    │
│  │  │  └─────────┘  └─────────┘            │   │    │
│  │  └──────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## API Reference

### ParallaxMcpServer

```typescript
interface ParallaxMcpServerOptions {
  logger: Logger;      // Pino logger instance
  maxAgents?: number;  // Maximum concurrent agents (default: 10)
}

class ParallaxMcpServer {
  constructor(options: ParallaxMcpServerOptions);
  connect(transport: Transport): Promise<void>;
  disconnect(): Promise<void>;
  getRuntime(): LocalRuntime;
  isConnected(): boolean;
}
```

### Tool Schemas

All tool inputs are validated with Zod schemas:

```typescript
import { SpawnInputSchema, StopInputSchema } from '@parallax/runtime-mcp';

// Spawn input
const spawn = SpawnInputSchema.parse({
  name: "my-agent",
  type: "claude",
  capabilities: ["code_review"],
});

// Stop input
const stop = StopInputSchema.parse({
  agentId: "abc123",
  force: false,
  timeout: 5000,
});
```

## License

MIT
