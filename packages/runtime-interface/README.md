# @parallaxai/runtime-interface

Shared interfaces and types for Parallax agent runtimes. This package defines the contracts that runtime providers and CLI adapters must implement.

## Installation

```bash
npm install @parallaxai/runtime-interface
```

## Usage

```typescript
import {
  RuntimeProvider,
  ThreadRuntimeProvider,
  AgentConfig,
  AgentHandle,
  ThreadHandle,
  CLIAdapter,
  AdapterRegistry,
} from '@parallaxai/runtime-interface';
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

### ThreadRuntimeProvider

Optional additive contract for runtimes that support first-class long-lived work threads:

- `spawnThread(input)` — Start a thread-backed unit of work
- `getThread(threadId)` — Get current thread state
- `listThreads(filter?)` — List known threads
- `sendToThread(threadId, input)` — Send input/keys/raw data to a thread
- `stopThread(threadId, options?)` — Stop a thread
- `subscribeThread(threadId)` — Stream normalized thread events

Thread creation may include a `ThreadPreparationSpec` to bundle workspace, env, context files, and approval policy as one preparation contract instead of loose spawn fields.

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

See the [source](./src/types.ts) for the full type definitions including `AgentConfig`, `AgentHandle`, `ThreadHandle`, `AgentMessage`, `ThreadEvent`, `RuntimeEvent`, and more.

## License

Apache-2.0
