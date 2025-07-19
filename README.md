# Parallax

> AI agent orchestration platform with uncertainty as a first-class citizen

## The Orchestra Philosophy 🎼

Think of Parallax as a conductor for your AI agent orchestra. Just as musicians in an orchestra don't need to coordinate with each other directly - they follow the conductor and focus on playing their part excellently - AI agents in Parallax remain independent and focused on their expertise while Parallax orchestrates their collective intelligence.

```
Traditional Multi-Agent Systems:        Parallax Approach:
    🎺 ←→ 🎻 ←→ 🥁                           🎼 Conductor
     ↕     ↕     ↕                          ╱  ╱  |  ╲  ╲
    🎷 ←→ 🎸 ←→ 📯                        🎺  🎻  🥁  🎷  🎸
    
Agents negotiate = Chaos              Conductor orchestrates = Symphony
```

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
- Docker (for etcd and optional services)
- Python >= 3.9 (for Python SDK)

### Installation

```bash
# Clone the repository
git clone https://github.com/parallax/parallax.git
cd parallax

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Start Parallax - One Command! 🚀

```bash
# Start everything you need
npm start

# In another terminal, run a demo
npm run demo:patterns
```

That's it! Parallax is now running with:
- ✅ etcd (service registry) 
- ✅ Control Plane API (port 8080)
- ✅ Ready for agents and patterns

### Other Startup Options

```bash
# Development with monitoring (Prometheus + Grafana + Jaeger)
npm run dev:monitor

# Full stack with database and web UI
npm run dev:full

# Production-like environment (all containerized)
npm run dev:prod
```

See our [Startup Guide](docs/STARTUP_GUIDE.md) for all options.

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

## Why the Orchestra Model?

The orchestra model isn't just a nice metaphor - it's fundamental to why Parallax works so well:

### 🎯 **Agent Simplicity**
Agents focus solely on their expertise, just like a violinist focuses on playing violin:
```typescript
// This is all an agent needs to do:
async analyze(task: string, data: any): Promise<[result, confidence]> {
  const result = doMySpecializedAnalysis(data);
  const confidence = calculateMyConfidence(result);
  return [result, confidence];
}
// No coordination logic, no negotiation protocols, no complexity!
```

### 🚀 **Scalability**
Add new agents like adding musicians to an orchestra - no need to retrain the entire ensemble:
- 10 agents or 1000 agents - same patterns work
- New agents automatically participate in existing patterns
- No agent-to-agent communication overhead

### 🎭 **Valuable Disagreements**
When the security expert and performance expert disagree, both perspectives are preserved:
```
Security Agent:     "This needs encryption" (confidence: 0.9)
Performance Agent:  "Encryption will slow us down" (confidence: 0.85)
Parallax:          "Both are right - here's the tradeoff for you to decide"
```

## Architecture

```
User/API → Control Plane → Pattern Engine → Prism Runtime
                ↓
         Agent Registry → gRPC Proxies
                ↓
         Remote Agents (any language)
```

Key design principles:
- Prism patterns run only in the core platform (conductor reads the sheet music)
- Agents are standalone services (musicians focus on their instruments)
- All communication via gRPC for language independence
- Confidence scores propagate automatically (the conductor tracks the tempo)

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