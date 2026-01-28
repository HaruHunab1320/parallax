---
sidebar_position: 1
title: Local Development
---

# Local Development

Run Parallax locally for development and testing.

## Prerequisites

- **Node.js** 18+ (for TypeScript SDK)
- **npm** or **pnpm** (package manager)
- **Git** (for cloning examples)

## Quick Start

### 1. Install the CLI

```bash
npm install -g @parallax/cli
```

### 2. Start the Control Plane

```bash
parallax start
```

This starts a local control plane on `http://localhost:8080`.

### 3. Verify Installation

```bash
parallax status
```

Expected output:

```
Parallax Control Plane
  Status: Running
  URL: http://localhost:8080
  Version: 1.0.0
  Agents: 0 connected
  Patterns: 0 registered
```

## Control Plane Configuration

### Default Configuration

The local control plane uses sensible defaults:

| Setting | Default | Description |
|---------|---------|-------------|
| Port | 8080 | HTTP/WebSocket port |
| Host | localhost | Bind address |
| Log Level | info | Logging verbosity |
| Max Agents | 100 | Maximum connected agents |
| Task Timeout | 30000 | Default task timeout (ms) |

### Custom Configuration

Create a `parallax.config.yaml` file:

```yaml
server:
  port: 9000
  host: 0.0.0.0

logging:
  level: debug
  format: json

execution:
  defaultTimeout: 60000
  maxConcurrentExecutions: 50

agents:
  maxConnections: 200
  heartbeatInterval: 5000
  reconnectTimeout: 30000
```

Start with custom config:

```bash
parallax start --config parallax.config.yaml
```

### Environment Variables

Override settings with environment variables:

```bash
export PARALLAX_PORT=9000
export PARALLAX_LOG_LEVEL=debug
export PARALLAX_MAX_AGENTS=200

parallax start
```

| Variable | Description |
|----------|-------------|
| `PARALLAX_PORT` | Server port |
| `PARALLAX_HOST` | Bind address |
| `PARALLAX_LOG_LEVEL` | Log level (debug, info, warn, error) |
| `PARALLAX_MAX_AGENTS` | Maximum agent connections |

## Running Agents Locally

### Create an Agent

```typescript
// agent.ts
import { ParallaxAgent } from '@parallax/sdk-typescript';

const agent = new ParallaxAgent({
  controlPlaneUrl: 'http://localhost:8080',
  capabilities: ['classification', 'analysis'],
  metadata: {
    name: 'local-agent',
    model: 'gpt-4',
  },
});

agent.onTask('classification', async (task) => {
  // Your classification logic
  return {
    category: 'technology',
    confidence: 0.92,
  };
});

agent.onTask('analysis', async (task) => {
  // Your analysis logic
  return {
    summary: 'Analysis complete',
    confidence: 0.88,
  };
});

agent.connect();
```

### Run the Agent

```bash
npx ts-node agent.ts
```

### Run Multiple Agents

For testing voting and consensus patterns, run multiple agents:

```bash
# Terminal 1
AGENT_NAME=agent-1 npx ts-node agent.ts

# Terminal 2
AGENT_NAME=agent-2 npx ts-node agent.ts

# Terminal 3
AGENT_NAME=agent-3 npx ts-node agent.ts
```

Or use the CLI:

```bash
parallax agent spawn --count 3 --capabilities classification,analysis
```

## Registering Patterns

### Via CLI

```bash
# Register a pattern file
parallax pattern register my-pattern.yaml

# List registered patterns
parallax pattern list

# View pattern details
parallax pattern show my-pattern
```

### Via SDK

```typescript
import { ParallaxClient } from '@parallax/sdk-typescript';
import fs from 'fs';

const client = new ParallaxClient({
  url: 'http://localhost:8080',
});

const yaml = fs.readFileSync('my-pattern.yaml', 'utf-8');
await client.registerPattern(yaml);
```

## Executing Patterns

### Via CLI

```bash
# Execute with inline input
parallax pattern execute my-pattern --input '{"content": "test"}'

# Execute with input file
parallax pattern execute my-pattern --input-file input.json

# Execute with streaming output
parallax pattern execute my-pattern --input '{"content": "test"}' --stream
```

### Via SDK

```typescript
const result = await client.executePattern('my-pattern', {
  content: 'Hello world',
});

console.log(result);
```

## Development Workflow

### Recommended Setup

```
project/
├── patterns/
│   ├── classifier.yaml
│   └── analyzer.yaml
├── agents/
│   ├── classification-agent.ts
│   └── analysis-agent.ts
├── tests/
│   └── patterns.test.ts
├── parallax.config.yaml
└── package.json
```

### Watch Mode

Automatically reload on changes:

```bash
# Watch patterns directory
parallax start --watch patterns/

# Patterns are reloaded when files change
```

### Testing Patterns

```bash
# Validate pattern syntax
parallax pattern validate my-pattern.yaml

# Dry run (validates without execution)
parallax pattern execute my-pattern --dry-run --input '{"content": "test"}'

# Execute and show detailed output
parallax pattern execute my-pattern --input '{"content": "test"}' --verbose
```

## Debugging

### Enable Debug Logging

```bash
parallax start --log-level debug
```

### View Execution Logs

```bash
# Stream logs
parallax logs --follow

# Filter by execution
parallax logs --execution-id exec_abc123

# Filter by agent
parallax logs --agent-id agent_xyz789
```

### Inspect Executions

```bash
# List recent executions
parallax execution list

# View execution details
parallax execution show exec_abc123

# View execution timeline
parallax execution timeline exec_abc123
```

### Debug Output

```
[2024-01-15T10:30:00Z] INFO  Execution started: exec_abc123
[2024-01-15T10:30:00Z] DEBUG Pattern: content-classifier v1.0.0
[2024-01-15T10:30:00Z] DEBUG Input: {"content": "test document"}
[2024-01-15T10:30:01Z] DEBUG Selecting agents with capabilities: [classification]
[2024-01-15T10:30:01Z] DEBUG Selected 3 agents: [agent_1, agent_2, agent_3]
[2024-01-15T10:30:01Z] DEBUG Dispatching tasks in parallel
[2024-01-15T10:30:02Z] DEBUG Agent agent_1 completed: {category: "tech", confidence: 0.9}
[2024-01-15T10:30:02Z] DEBUG Agent agent_2 completed: {category: "tech", confidence: 0.85}
[2024-01-15T10:30:03Z] DEBUG Agent agent_3 completed: {category: "tech", confidence: 0.88}
[2024-01-15T10:30:03Z] DEBUG Aggregating with strategy: voting (majority)
[2024-01-15T10:30:03Z] INFO  Execution completed: exec_abc123 (3.2s)
```

## Data Storage

### Default Storage

By default, the local control plane uses in-memory storage:

- Patterns and executions are lost on restart
- Suitable for development and testing
- No external dependencies

### File-Based Storage

Enable persistence across restarts:

```yaml
# parallax.config.yaml
storage:
  type: file
  path: ./data
```

This creates:

```
data/
├── patterns/
│   └── content-classifier.yaml
├── executions/
│   └── exec_abc123.json
└── agents/
    └── registry.json
```

### SQLite Storage

For more robust local persistence:

```yaml
storage:
  type: sqlite
  path: ./parallax.db
```

## Performance Tuning

### Local Development Settings

```yaml
# parallax.config.yaml
execution:
  # Lower concurrency for debugging
  maxConcurrentExecutions: 5

  # Longer timeouts for stepping through
  defaultTimeout: 120000

agents:
  # Faster heartbeats for development
  heartbeatInterval: 2000
```

### Simulating Production Load

```bash
# Generate test load
parallax benchmark --pattern my-pattern \
  --concurrency 10 \
  --requests 100 \
  --input-file test-inputs.json
```

## Common Issues

### Control Plane Won't Start

**Port already in use:**

```bash
# Check what's using the port
lsof -i :8080

# Use a different port
parallax start --port 9000
```

**Permission denied:**

```bash
# Use a port above 1024
parallax start --port 8080  # OK
parallax start --port 80    # Requires sudo
```

### Agents Won't Connect

**Check control plane is running:**

```bash
parallax status
```

**Verify URL is correct:**

```typescript
const agent = new ParallaxAgent({
  controlPlaneUrl: 'http://localhost:8080',  // Not https
});
```

**Check for firewall issues:**

```bash
curl http://localhost:8080/health
```

### Patterns Not Executing

**Check agents are available:**

```bash
parallax agent list
```

**Verify capabilities match:**

```bash
# Pattern requires [classification]
parallax agent list --capabilities classification
```

**Check execution queue:**

```bash
parallax execution list --status pending
```

## Next Steps

- [Docker Deployment](/docs/deployment/docker) - Container deployment
- [Kubernetes](/docs/deployment/kubernetes) - Production deployment
- [Your First Pattern](/docs/getting-started/your-first-pattern) - Create a pattern
