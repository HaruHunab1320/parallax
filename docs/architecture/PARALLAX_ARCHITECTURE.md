# Parallax Architecture

## Overview

Parallax is an AI orchestration platform that coordinates agent swarms using uncertainty-aware patterns written in the Prism language. The key architectural principle is separation of concerns: coordination logic runs in the core platform using Prism, while business logic runs in agents written in any language.

## Core Architecture Principles

### 1. Uncertainty as First-Class Citizen
- All agent results include confidence scores (0.0 to 1.0)
- Patterns make decisions based on confidence levels
- Confidence propagates through pattern execution
- The Prism language provides operators for confidence handling (`~`, `~>`)

### 2. Language Independence
- Agents can be written in any language
- Communication via gRPC protocol
- No Prism runtime required in agents
- SDKs provide language-specific conveniences

### 3. Pattern-Based Coordination
- Reusable coordination patterns written in Prism
- Patterns stored as `.prism` files
- Dynamic pattern loading and execution
- Patterns can compose other patterns

## System Components

### Control Plane
The brain of the system that runs coordination logic.

**Components:**
- **Pattern Engine**: Loads and executes Prism patterns
- **Runtime Manager**: Integrates the Prism runtime (prism-uncertainty)
- **Registry**: Service discovery (etcd-based or local)

**Responsibilities:**
- Execute coordination patterns
- Select appropriate agents
- Aggregate results with confidence
- Make uncertainty-aware decisions

### Data Plane
Handles execution, caching, and reliability.

**Components:**
- **Execution Engine**: Manages pattern execution lifecycle
- **Confidence Tracker**: Tracks confidence metrics over time
- **Result Cache**: Caches results with confidence-based TTL
- **Circuit Breaker**: Provides fault tolerance
- **Load Balancer**: Distributes work across agents

### Agent Layer
Where business logic lives, in any language.

**Components:**
- **Agent Base Classes**: SDK-provided base implementations
- **gRPC Server**: Built into each agent
- **Health Checking**: Agent availability monitoring

**Agent Contract:**
```protobuf
service ConfidenceAgent {
  rpc Analyze(AgentRequest) returns (ConfidenceResult);
  rpc GetCapabilities(Empty) returns (Capabilities);
  rpc HealthCheck(Empty) returns (Health);
}
```

## Data Flow

### 1. Pattern Execution Request
```
Client → API → Pattern Engine → Pattern Loader
                                      ↓
                              Load .prism file
```

### 2. Agent Selection
```
Pattern → Registry Query → Filter by Capabilities
              ↓
        Create gRPC Proxies
```

### 3. Task Distribution
```
Pattern Logic → Agent Proxies → gRPC Calls → Remote Agents
                                                   ↓
                                            Business Logic
                                                   ↓
                                            Return (result, confidence)
```

### 4. Result Aggregation
```
Agent Results → Pattern Logic → Confidence-based decisions
                                        ↓
                                 Final Result
```

## Coordination Patterns

Parallax includes 10 built-in patterns that demonstrate different coordination strategies:

### Basic Patterns
1. **Consensus Builder**: Weighted voting across agents
2. **Load Balancer**: Optimal agent selection
3. **Confidence Cascade**: Sequential refinement until target confidence

### Advanced Patterns
4. **Epistemic Orchestrator**: Identifies valuable disagreements
5. **Uncertainty Router**: Routes based on task uncertainty
6. **Parallel Exploration**: Explores multiple solution paths
7. **Multi-Validator**: Cross-validation across validators

### Composite Patterns
8. **Cascading Refinement**: Progressive quality improvement
9. **Uncertainty MapReduce**: Distributed processing with confidence
10. **Robust Analysis**: Combines multiple patterns for robustness

## Deployment Architecture

### Development Mode
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent 1   │     │   Agent 2   │     │   Agent 3   │
│ (localhost) │     │ (localhost) │     │ (localhost) │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                    ┌──────┴──────┐
                    │Control Plane│
                    │ (localhost) │
                    └─────────────┘
```

Uses `PARALLAX_LOCAL_AGENTS` environment variable for agent discovery.

### Production Mode
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent 1   │     │   Agent 2   │     │   Agent 3   │
│   (k8s pod) │     │ (AWS Lambda)│     │ (GCP Cloud  │
│             │     │             │     │    Run)     │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                      etcd cluster
                           │
                    ┌──────┴──────┐
                    │Control Plane│
                    │ (k8s deploy)│
                    └─────────────┘
```

Agents register with etcd for service discovery.

## Confidence Protocol

### Confidence Values
- Range: 0.0 (no confidence) to 1.0 (absolute certainty)
- Propagation: Confidence flows through pattern execution
- Aggregation: Various strategies (min, max, average, weighted)

### Uncertainty Handling
```prism
// Prism's unique "uncertain if" construct
uncertain if (result.confidence < 0.5) {
  high {
    // Handle high uncertainty
    escalate_to_human()
  }
  medium {
    // Try additional agents
    refine_with_more_agents()
  }
  low {
    // Proceed with caution
    return result with_warning
  }
}
```

## Security Architecture

### Current Implementation
- Development-focused (no auth)
- Plain gRPC communication
- Local agent trust model

### Production Security (Planned)
- mTLS between all components
- API key authentication
- RBAC for pattern execution
- Encrypted etcd storage
- Network policies in Kubernetes

## Performance Characteristics

### Scalability
- Horizontal scaling of agents
- Pattern execution parallelization
- Connection pooling for gRPC
- Result caching reduces redundant work

### Limitations
- Control plane is currently single-instance
- Pattern execution is memory-bound
- No persistent execution state

## Extensibility

### Adding New Patterns
1. Create `.prism` file in patterns directory
2. Define metadata (name, version, requirements)
3. Implement coordination logic
4. Pattern auto-discovered on startup

### Adding New Languages
1. Implement gRPC service contract
2. Create SDK with base agent class
3. Provide health check implementation
4. Register with platform

### Custom Confidence Strategies
Patterns can implement custom confidence aggregation:
```prism
// Custom weighted confidence
totalWeight = agents.reduce((sum, a) => sum + a.expertise, 0)
weightedConfidence = results.reduce((sum, r, i) => 
  sum + (r.confidence * agents[i].expertise / totalWeight), 0
)
```

## Monitoring and Observability

### Metrics Tracked
- Pattern execution times
- Agent response times
- Confidence distributions
- Cache hit rates
- Circuit breaker states

### Planned Integrations
- OpenTelemetry for distributed tracing
- Prometheus metrics export
- Grafana dashboards
- Confidence trend analysis

## Future Architecture Directions

### Multi-Region Federation
- Cross-region agent discovery
- Pattern replication
- Geo-distributed execution

### Pattern Marketplace
- Pattern sharing and versioning
- Community contributions
- Pattern certification

### Advanced Features
- Pattern composition UI
- Visual confidence flow
- A/B testing for patterns
- Automated pattern optimization