# @parallax/runtime-interface

Shared interfaces and types for Parallax agent runtimes. This package defines the contracts that runtime providers and CLI adapters must implement.

## Installation

```bash
npm install @parallax/runtime-interface
```

## Usage

```typescript
import {
  RuntimeProvider,
  AgentConfig,
  AgentHandle,
  CLIAdapter,
  AdapterRegistry,
} from '@parallax/runtime-interface';
```

## Core Interfaces

### RuntimeProvider

Defines the contract for agent runtime implementations:

- `startAgent(config)` — Start an agent with the given configuration
- `stopAgent(agentId, options?)` — Stop a running agent
- `sendMessage(agentId, message, options?)` — Send a message to an agent
- `getAgentStatus(agentId)` — Get the current status of an agent
- `listAgents(filter?)` — List agents matching optional filter criteria
- `getLogs(agentId, options?)` — Retrieve agent log entries

### CLIAdapter

Defines the contract for CLI tool adapters that parse and interact with specific coding agents:

- `parseOutput(data)` — Parse raw CLI output into structured messages
- `detectLogin(data)` — Detect login/authentication prompts
- `detectBlockingPrompt(data)` — Detect blocking prompts requiring user input
- `formatInput(message)` — Format a message for CLI input
- `getSpawnConfig(config)` — Get spawn configuration for the CLI tool

### AdapterRegistry

Registry for managing CLI adapters by agent type.

## Types

See the [source](./src/types.ts) for the full type definitions including `AgentConfig`, `AgentHandle`, `AgentMessage`, `RuntimeEvent`, and more.

## License

Apache-2.0
