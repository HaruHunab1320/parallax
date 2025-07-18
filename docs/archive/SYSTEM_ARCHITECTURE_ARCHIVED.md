# Parallax System Architecture

## Overview

Parallax is an AI orchestration platform that treats uncertainty as a first-class citizen through the Prism language. The platform enables coordination of AI agent swarms with confidence-aware decision making.

## Current Implementation Status

### ✅ Completed Components

#### Core Platform
- **Runtime Package** (`@parallax/runtime`)
  - `ParallaxCoordinator` - Main coordination engine
  - `AgentRegistry` - In-memory agent management
  - `GrpcAgentProxy` - gRPC communication with remote agents
  - `ConfidenceProtocol` - Confidence value handling
  - Full TypeScript types and interfaces

- **Control Plane** (`@parallax/control-plane`)
  - `PatternEngine` - Loads and executes .prism patterns
  - `PatternLoader` - Dynamic pattern discovery and loading
  - `RuntimeManager` - Integrates Prism runtime (prism-uncertainty@1.0.10)
  - `EtcdRegistry` - Service discovery via etcd
  - Local agent support for development

- **Data Plane** (`@parallax/data-plane`)
  - `ConfidenceTracker` - Tracks confidence metrics over time
  - `ExecutionEngine` - Pattern execution management
  - `ParallelExecutor` - Concurrent task execution
  - `ResultCache` - Caching with confidence-aware TTL
  - `CircuitBreaker` - Fault tolerance for agents
  - `LoadBalancer` - Agent selection strategies

#### Patterns (All 10 Implemented)
1. **consensus-builder.prism** - Weighted consensus from multiple agents
2. **epistemic-orchestrator.prism** - Identifies valuable disagreements
3. **uncertainty-router.prism** - Routes based on confidence levels
4. **confidence-cascade.prism** - Cascades until target confidence
5. **load-balancer.prism** - Optimal agent selection
6. **cascading-refinement.prism** - Progressive quality improvement
7. **parallel-exploration.prism** - Explores multiple approaches
8. **multi-validator.prism** - Multi-agent validation
9. **uncertainty-mapreduce.prism** - Distributed processing
10. **robust-analysis.prism** - Composite pattern using others

#### SDKs
- **TypeScript SDK** (`@parallax/sdk-typescript`)
  - `ParallaxAgent` base class with gRPC server
  - Decorators for agent capabilities
  - Pattern utilities
  - Server helpers for easy deployment
  - Full standalone agent support

- **Proto Definitions** (`@parallax/proto`)
  - Complete gRPC service definitions
  - Confidence protocol messages
  - Agent communication protocol

#### Examples
- **Standalone Agent Examples**
  - Sentiment Analysis Agent
  - Math Computation Agent
  - Full gRPC implementation examples

### 🚧 Partially Implemented

#### CLI (`@parallax/cli`)
- Basic command structure exists
- Commands defined but not fully implemented:
  - `agent` - Agent management
  - `pattern` - Pattern operations
  - `run` - Execute patterns
  - `start` - Start services
  - `status` - System status

#### Python SDK (`@parallax/sdk-python`)
- Package structure created
- Implementation pending

### ❌ Not Yet Implemented

#### Infrastructure
- Time series database integration (InfluxDB)
- Kubernetes operators and CRDs
- Multi-region federation
- mTLS authentication
- Distributed tracing integration

#### Platform Features
- Web dashboard
- Pattern marketplace
- Analytics engine
- Anomaly detection
- Comprehensive monitoring

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
├─────────────────────────────────────────────────────────────┤
│  CLI (partial)  │  API (planned)  │  Web UI (planned)       │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                      Control Plane                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Pattern Engine                         │   │
│  │  • Loads .prism files from /patterns                │   │
│  │  • Executes via Prism runtime                       │   │
│  │  • Manages pattern lifecycle                        │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Runtime Manager                         │   │
│  │  • Integrates prism-uncertainty@1.0.10              │   │
│  │  • Injects Parallax context                         │   │
│  │  • Handles script execution                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Registry                             │   │
│  │  • Etcd-based service discovery                     │   │
│  │  • Local agent support (dev mode)                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                       Data Plane                             │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Confidence  │  │  Execution   │  │    Result    │     │
│  │   Tracker    │  │   Engine     │  │    Cache     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Circuit    │  │    Load      │  │   Parallel   │     │
│  │   Breaker    │  │   Balancer   │  │   Executor   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                               │
                        gRPC Protocol
                               │
┌─────────────────────────────────────────────────────────────┐
│                        Agent Layer                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  TypeScript  │  │    Python    │  │     Rust     │     │
│  │    Agent     │  │    Agent     │  │    Agent     │     │
│  │  (complete)  │  │  (planned)   │  │  (planned)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         ▲                  ▲                 ▲              │
│         │                  │                 │              │
│    Standalone         Standalone       Standalone          │
│    gRPC Server       gRPC Server      gRPC Server         │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Separation of Concerns
- **Core Platform**: Runs Prism patterns and coordination logic
- **Agents**: Standalone services in any language implementing business logic
- **Communication**: gRPC protocol for language independence

### 2. Confidence as First-Class Citizen
- All agent results include confidence scores
- Patterns make decisions based on confidence levels
- Confidence propagation through pattern execution

### 3. Pattern-Based Coordination
- Reusable coordination patterns in Prism language
- Patterns can compose other patterns
- Dynamic pattern loading and execution

### 4. Development-First Design
- Local agent support without service discovery
- Environment variable configuration
- Easy standalone agent creation

## Data Flow

1. **Pattern Execution Request**
   ```
   User/API → Control Plane → Pattern Engine
   ```

2. **Agent Selection**
   ```
   Pattern Engine → Registry → Agent Metadata
   Pattern Engine → Create gRPC Proxies
   ```

3. **Task Distribution**
   ```
   Pattern (Prism) → Agent Proxies → gRPC → Remote Agents
   ```

4. **Result Aggregation**
   ```
   Agents → gRPC → Proxies → Pattern → Confidence Logic → Result
   ```

## Configuration

### Environment Variables
- `PARALLAX_ETCD_ENDPOINTS` - Etcd cluster endpoints
- `PARALLAX_LOCAL_AGENTS` - Local agent definitions for development
- `PARALLAX_PATTERNS_DIR` - Pattern directory location
- `PARALLAX_REGISTRY` - Registry endpoint for agents

### Pattern Location
Default: `/patterns/*.prism`

### Agent Registration
1. **Production**: Agents register with etcd
2. **Development**: Use `PARALLAX_LOCAL_AGENTS` environment variable

## Security Considerations

### Current Implementation
- No authentication (development mode)
- Plain gRPC (no TLS)
- No authorization checks

### Planned Security Features
- mTLS for agent communication
- API key authentication
- Role-based access control
- Pattern execution policies

## Performance Characteristics

### Implemented Optimizations
- Agent connection pooling via gRPC
- Result caching with confidence-based TTL
- Parallel pattern execution
- Circuit breakers for fault tolerance

### Scalability Limits (Current)
- In-memory agent registry (no persistence)
- Single control plane instance
- No distributed pattern execution
- Local state management

## Next Steps for Production

1. **High Priority**
   - Complete Python SDK
   - Add persistent state management
   - Implement health checking endpoints
   - Add comprehensive logging

2. **Medium Priority**
   - Web dashboard for monitoring
   - Distributed pattern execution
   - Time series metrics storage
   - Pattern versioning

3. **Future Enhancements**
   - Kubernetes native deployment
   - Multi-region federation
   - Pattern marketplace
   - Advanced analytics

## Development Guide

### Running Locally
```bash
# Install dependencies
pnpm install

# Start control plane
pnpm --filter @parallax/control-plane dev

# Start example agents
pnpm --filter @parallax/example-standalone-agent dev
```

### Creating New Agents
See `/examples/standalone-agent/README.md` for detailed guide.

### Writing Patterns
See `/patterns/README.md` for pattern development guide.