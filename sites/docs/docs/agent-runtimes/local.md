---
sidebar_position: 2
title: Local Runtime
---

# Local Runtime

The local runtime spawns agents as PTY (pseudo-terminal) sessions on the host machine, ideal for development and testing.

## Architecture

```
┌─────────────────────────────────────────┐
│            Local Runtime                 │
│  ┌─────────────────────────────────────┐│
│  │           PTY Manager               ││
│  │  ┌───────────────────────────────┐ ││
│  │  │  PTY Session 1 (Claude)       │ ││
│  │  │  stdin ◄──► stdout            │ ││
│  │  └───────────────────────────────┘ ││
│  │  ┌───────────────────────────────┐ ││
│  │  │  PTY Session 2 (Codex)        │ ││
│  │  │  stdin ◄──► stdout            │ ││
│  │  └───────────────────────────────┘ ││
│  └─────────────────────────────────────┘│
│                                          │
│  ┌─────────────────────────────────────┐│
│  │         CLI Adapters                ││
│  │  Claude | Codex | Gemini            ││
│  └─────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

## Installation

```bash
cd runtimes/local
pnpm install
pnpm build
```

## Prerequisites

Ensure the CLI tools are installed and authenticated:

```bash
# Claude Code
npm install -g @anthropic-ai/claude-code
claude auth

# Codex CLI
npm install -g @openai/codex
codex auth

# Gemini CLI
npm install -g @google/gemini-cli
gemini auth
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 3100 | HTTP server port |
| `LOG_LEVEL` | info | Logging level |
| `MAX_AGENTS` | 10 | Maximum concurrent agents |
| `DEFAULT_TIMEOUT` | 60000 | Default command timeout (ms) |

## Starting the Server

```bash
# Development
pnpm dev

# Production
pnpm start

# With custom port
PORT=3150 pnpm start
```

## CLI Adapters

Each agent type has a dedicated adapter:

### Claude Adapter

```typescript
{
  command: 'claude',
  args: ['--print'],  // Non-interactive mode
  env: {
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY
  }
}
```

### Codex Adapter

```typescript
{
  command: 'codex',
  args: ['--quiet'],
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  }
}
```

### Gemini Adapter

```typescript
{
  command: 'gemini',
  args: [],
  env: {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY
  }
}
```

## PTY Sessions

Each agent runs in an isolated PTY session that:
- Provides full terminal emulation
- Captures all stdout/stderr output
- Maintains command history
- Handles interactive prompts

### Session Lifecycle

```
spawn() ──► create PTY ──► start CLI ──► ready
                                │
                           send message
                                │
                           wait response
                                │
stop() ◄─── cleanup ◄─── kill process
```

## API Usage

### Spawn Agent

```bash
curl -X POST http://localhost:3100/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-claude",
    "type": "claude",
    "workdir": "/path/to/project"
  }'
```

### Send Message

```bash
curl -X POST http://localhost:3100/agents/agent-123/send \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What files are in this directory?",
    "timeout": 30000
  }'
```

### Get Logs

```bash
curl http://localhost:3100/agents/agent-123/logs?lines=50
```

### Stop Agent

```bash
curl -X DELETE http://localhost:3100/agents/agent-123
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `CLI_NOT_FOUND` | CLI tool not installed | Install the CLI tool globally |
| `AUTH_REQUIRED` | CLI not authenticated | Run `claude auth` or equivalent |
| `SPAWN_FAILED` | PTY creation failed | Check permissions and resources |
| `TIMEOUT` | Command timed out | Increase timeout or check agent |

## Debugging

### View Agent Output

```bash
# Stream logs in real-time
curl -N http://localhost:3100/agents/agent-123/stream
```

### Check Agent Status

```bash
curl http://localhost:3100/agents/agent-123
```

### Health Check

```bash
curl http://localhost:3100/health
```

## Best Practices

1. **Set Working Directory** - Always specify `workdir` for file operations
2. **Use Timeouts** - Set appropriate timeouts for long-running tasks
3. **Clean Up** - Stop agents when done to free resources
4. **API Keys** - Use environment variables for API keys
5. **Log Level** - Use `debug` level when troubleshooting

## Next Steps

- [Docker Runtime](/agent-runtimes/docker) - For isolated containers
- [Kubernetes Runtime](/agent-runtimes/kubernetes) - For production
