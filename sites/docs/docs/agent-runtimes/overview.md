---
sidebar_position: 1
title: Overview
---

# Agent Runtimes

Parallax can spawn and manage CLI-based AI agents dynamically, enabling on-demand agent orchestration across multiple runtime environments.

## What are Agent Runtimes?

Agent Runtimes allow Parallax to:
- **Spawn** CLI agents (Claude Code, Codex, Gemini CLI) on demand
- **Manage** agent lifecycle (start, communicate, monitor, stop)
- **Scale** across local, Docker, and Kubernetes environments

## Supported Agent Types

| Agent Type | CLI Tool | Description |
|------------|----------|-------------|
| `claude` | Claude Code | Anthropic's Claude CLI for coding tasks |
| `codex` | Codex CLI | OpenAI's Codex CLI |
| `gemini` | Gemini CLI | Google's Gemini CLI |

## Runtime Environments

```
┌─────────────────────────────────────────────────────────────────┐
│                      Control Plane                               │
│                  AgentRuntimeService                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│    Local      │   │    Docker     │   │  Kubernetes   │
│   Runtime     │   │   Runtime     │   │   Runtime     │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ PTY Sessions  │   │  Containers   │   │   CRD Pods    │
│ Direct CLI    │   │  Isolation    │   │  Auto-scaling │
│ Development   │   │  Staging      │   │  Production   │
└───────────────┘   └───────────────┘   └───────────────┘
```

| Runtime | Use Case | Requirements |
|---------|----------|--------------|
| **[Local](/agent-runtimes/local)** | Development | Node.js, CLI tools installed |
| **[Docker](/agent-runtimes/docker)** | Staging/Testing | Docker daemon |
| **[Kubernetes](/agent-runtimes/kubernetes)** | Production | K8s cluster with CRD support |

## Quick Start

### 1. Start a Runtime Server

```bash
# Local development
cd runtimes/local
pnpm build && pnpm start
# Server starts on port 3100
```

### 2. Configure Control Plane

```bash
export PARALLAX_LOCAL_RUNTIME_URL=http://localhost:3100
cd packages/control-plane
pnpm start
```

### 3. Spawn an Agent

```bash
curl -X POST http://localhost:3000/api/managed-agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "code-reviewer",
    "type": "claude",
    "capabilities": ["code_review"]
  }'
```

### 4. Send a Task

```bash
curl -X POST http://localhost:3000/api/managed-agents/agent-123/send \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Review auth.ts for security issues",
    "expectResponse": true
  }'
```

## API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/managed-agents` | Spawn new agent |
| `GET` | `/api/managed-agents` | List all agents |
| `GET` | `/api/managed-agents/:id` | Get agent details |
| `POST` | `/api/managed-agents/:id/send` | Send message to agent |
| `GET` | `/api/managed-agents/:id/logs` | Get agent logs |
| `GET` | `/api/managed-agents/:id/metrics` | Get agent metrics |
| `DELETE` | `/api/managed-agents/:id` | Stop agent |

### Spawn Request

```typescript
{
  name: string;           // Agent name
  type: 'claude' | 'codex' | 'gemini';
  capabilities?: string[];
  workdir?: string;       // Working directory
  env?: Record<string, string>;
  runtime?: 'local' | 'docker' | 'kubernetes';
}
```

### Agent Response

```typescript
{
  id: string;
  name: string;
  type: string;
  status: 'starting' | 'ready' | 'busy' | 'error' | 'stopped';
  runtime: string;
  createdAt: string;
}
```

## Events

The runtime system emits events via WebSocket:

| Event | Description |
|-------|-------------|
| `agent_ready` | Agent is ready to receive tasks |
| `agent_stopped` | Agent has stopped |
| `message` | Message sent or received |
| `error` | Error occurred |

```javascript
const ws = new WebSocket('ws://localhost:3000/api/managed-agents/events');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

## Multi-Runtime Selection

When multiple runtimes are configured, selection uses priority:

1. **Explicit** - If specified in spawn request
2. **Local** (priority 10) - Best for development
3. **Docker** (priority 20) - Good for staging
4. **Kubernetes** (priority 30) - Best for production

## Integration with Patterns

Managed agents work with org-chart patterns:

```yaml
structure:
  roles:
    architect:
      agentType: claude
      managed: true  # Spawn via runtime
      capabilities:
        - architecture
```

## Next Steps

- [Local Runtime](/agent-runtimes/local) - Development setup
- [Docker Runtime](/agent-runtimes/docker) - Container-based agents
- [Kubernetes Runtime](/agent-runtimes/kubernetes) - Production deployment
- [Org-Chart Patterns](/patterns/org-chart-patterns) - Hierarchical orchestration
