# Parallax

> AI agent orchestration platform with uncertainty as a first-class citizen

## Overview

Parallax is a coordination platform for AI agent swarms that treats uncertainty as a first-class citizen through the Prism language. When expert AI agents disagree with high confidence, that's not a bug - it's valuable signal that reveals trade-offs and suggests parallel exploration paths.

## Key Features

- **Uncertainty-Aware Coordination**: Uses the Prism language with confidence operators (`~`, `~>`) and uncertain conditionals
- **10 Built-in Patterns**: From consensus building to parallel exploration, all patterns handle uncertainty gracefully
- **Language Agnostic**: Agents can be written in any language and communicate via gRPC
- **Confidence Propagation**: Confidence scores flow through pattern execution automatically
- **Development-First**: Easy local development with standalone agents

## Project Structure

```
parallax/
├── packages/
│   ├── runtime/             # Core runtime with coordinator and agent registry
│   ├── control-plane/       # Pattern engine and Prism runtime integration
│   ├── data-plane/          # Execution engine, caching, and load balancing
│   ├── proto/               # gRPC protocol definitions
│   ├── sdk-typescript/      # TypeScript SDK for building agents
│   ├── sdk-python/          # Python SDK (structure ready)
│   └── cli/                 # Command-line interface
├── patterns/                # 10 coordination patterns in Prism
├── examples/
│   └── standalone-agent/    # Example agents (sentiment, math)
└── docs/                    # Documentation
```

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 10.11.0
- Python >= 3.9 (for Python SDK when implemented)

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Run Example Agent

```bash
# Terminal 1: Start a standalone agent
cd examples/standalone-agent
pnpm dev

# Terminal 2: Start control plane with local agent
PARALLAX_LOCAL_AGENTS="sentiment-agent-1:Sentiment Analyzer:localhost:50051:analysis,text,sentiment" \
pnpm --filter @parallax/control-plane dev
```

### Create Your First Agent

```typescript
import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';

class MyAgent extends ParallaxAgent {
  constructor() {
    super('my-agent-1', 'My Agent', ['analysis']);
  }

  async analyze(task: string, data?: any): Promise<[any, number]> {
    // Your analysis logic
    const result = { answer: "42" };
    const confidence = 0.95;
    return [result, confidence];
  }
}

// Start the agent
const agent = new MyAgent();
await serveAgent(agent, 50051);
```

## Coordination Patterns

Parallax includes 10 battle-tested coordination patterns:

1. **Consensus Builder** - Builds weighted consensus from multiple agents
2. **Epistemic Orchestrator** - Identifies valuable disagreements between experts
3. **Uncertainty Router** - Routes tasks based on confidence levels
4. **Confidence Cascade** - Cascades through agents until target confidence
5. **Load Balancer** - Distributes work optimally across agents
6. **Cascading Refinement** - Progressively improves quality
7. **Parallel Exploration** - Explores multiple solution paths
8. **Multi-Validator** - Validates across multiple validators
9. **Uncertainty MapReduce** - Distributed processing with confidence
10. **Robust Analysis** - Composite pattern for maximum robustness

## Architecture

```
User/API → Control Plane → Pattern Engine → Prism Runtime
                ↓
         Agent Registry → gRPC Proxies
                ↓
         Remote Agents (any language)
```

Key design principles:
- Prism patterns run only in the core platform
- Agents are standalone services (no Prism runtime needed)
- All communication via gRPC for language independence
- Confidence scores propagate automatically

## Development

```bash
# Run tests
pnpm test

# Lint code
pnpm lint

# Type check
pnpm typecheck

# Start development mode
pnpm dev
```

### Working with Patterns

Patterns are written in Prism and stored in `/patterns/*.prism`. To add a new pattern:

1. Create a `.prism` file in the patterns directory
2. Add metadata comments (@name, @version, etc.)
3. Implement coordination logic using Prism's uncertainty features
4. Return results with confidence using `~>`

Example pattern snippet:
```prism
agents = parallax.agents.filter(a => a.capabilities.includes("analysis"))
results = parallel(agents.map(a => a.analyze(input.task, input.data)))
confidence = averageConfidence(results)
result ~> confidence
```

## Documentation

- [System Architecture](docs/SYSTEM_ARCHITECTURE.md) - Current implementation details
- [Pattern Guide](patterns/README.md) - How to use and write patterns
- [Platform Blueprint](PLATFORM_BLUEPRINT.md) - Original design vision

## Status

### ✅ Implemented
- Core runtime and coordination engine
- TypeScript SDK with gRPC support
- All 10 coordination patterns
- Pattern engine with Prism integration
- Confidence tracking and propagation
- Example agents

### 🚧 In Progress
- CLI commands
- Python SDK
- Monitoring and observability

### 📋 Planned
- Web dashboard
- Pattern marketplace
- Kubernetes operators
- Multi-region federation

## Contributing

We welcome contributions! Please see our contributing guidelines (coming soon).

## License

[License information to be added]