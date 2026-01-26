# Parallax Architecture v2

> **The Evolution to Pattern-Driven AI Orchestration**

## Table of Contents

1. [Overview](#overview)
2. [Core Principles](#core-principles)
3. [System Architecture](#system-architecture)
4. [Development Workflow](#development-workflow)
5. [Package Structure](#package-structure)
6. [Pattern Generation & Execution](#pattern-generation--execution)
7. [Communication Flow](#communication-flow)
8. [Deployment Modes](#deployment-modes)
9. [Security Model](#security-model)
10. [Implementation Status](#implementation-status)
11. [Future Directions](#future-directions)

## Overview

Parallax is an AI orchestration platform that coordinates agent swarms using uncertainty-aware patterns written in the Prism language. The v2 architecture introduces development-time pattern generation from composable primitives, eliminating the need for runtime LLMs while enabling unlimited flexibility.

### Key Evolution from v1

- **v1**: Pre-written patterns in `/patterns` directory
- **v2**: Patterns generated at development time from primitives
- **Result**: True open source with no runtime AI dependencies

### Key Differentiators

- **Pattern as Code**: Orchestration patterns are version-controlled artifacts
- **Primitive Composition**: 20-30 primitives can create thousands of patterns
- **Development-Time AI**: LLMs used only during pattern development
- **Uncertainty-aware**: All decisions include confidence scores (0.0-1.0)
- **Language agnostic**: Agents can be written in any language

## Core Principles

### 1. Patterns as Development Artifacts
```bash
# Generate pattern at development time
parallax generate pattern "Multi-stage security review" \
  --output ./patterns/security-review.prism

# Commit to version control
git add ./patterns/security-review.prism
git commit -m "Add security review pattern"

# Execute in production (no LLM needed)
parallax run security-review --input data.json
```

### 2. Primitive-Based Composition
```prism
// Patterns are composed from atomic primitives
import { parallel } from "@parallax/primitives/execution"
import { consensus } from "@parallax/primitives/aggregation"
import { threshold } from "@parallax/primitives/confidence"

// Custom orchestration logic
results = parallel(agents)
decision = consensus(results, 0.8)
final = threshold(decision, 0.9)
```

### 3. Separation of Concerns
- **Pattern Generation**: Development-time with user-provided LLMs
- **Pattern Execution**: Runtime orchestration without AI
- **Business Logic**: Lives in agents using any language
- **Infrastructure**: Handled by platform (scaling, security, monitoring)

### 4. True Open Source
- No hidden LLM costs
- No vendor lock-in
- Community-driven pattern marketplace
- Enterprise features for production deployment

## System Architecture

Agent Runtime Layer:
- Manages PTY-backed CLI sessions for agents.
- Handles interactive auth / login flows.
- Registers agents with Parallax registry.

See `docs/AGENT_RUNTIME_SUPPORT_DEVELOPMENT.md`.

```
┌─────────────────────────────────────────────────────────────┐
│                    Development Time                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │Pattern SDK  │  │User-Provided │  │  Pattern Tests  │   │
│  │            │  │     LLM      │  │                 │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│           │               │                   │             │
│           └───────────────┴───────────────────┘             │
│                          │                                  │
│                     .prism files                           │
│                   (committed to git)                       │
└─────────────────────────┴───────────────────────────────────┘
                          │
                    Runtime Boundary
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                    Runtime System                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   CLI/API   │  │Pattern Engine│  │Service Registry │   │
│  │            │  │              │  │    (etcd)       │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│                          │                                  │
│                   Control Plane                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │Runtime Mgr  │  │Health Monitor│  │Metrics Collector│   │
│  │(Prism)      │  │              │  │                 │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ Internal gRPC
┌───────────────────────┴─────────────────────────────────────┐
│                       Data Plane                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Execution   │  │Agent Proxy & │  │   Confidence    │   │
│  │   Engine    │  │Load Balancer │  │    Tracker      │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │Result Cache │  │Circuit Breaker│  │Pattern Registry │   │
│  │             │  │              │  │                 │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ gRPC (mTLS in production)
┌───────────────────────┴─────────────────────────────────────┐
│                       Agent Layer                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │TypeScript   │  │Python Agents │  │   Go Agents     │   │
│  │  Agents     │  │              │  │                 │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │Rust Agents  │  │ Java Agents  │  │ Custom Agents   │   │
│  │             │  │   (future)   │  │                 │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### Development Layer (NEW)
- **Pattern SDK**: CLI and library for pattern generation
- **User-Provided LLM**: OpenAI, Anthropic, or custom LLM for generation
- **Pattern Tests**: Validate patterns before deployment

#### Control Plane
- **Pattern Engine**: Loads and executes .prism patterns
- **Runtime Manager**: Manages Prism runtime instances
- **Service Registry**: Agent discovery and health monitoring
- **API/CLI**: User interface for pattern execution

#### Data Plane
- **Execution Engine**: Manages pattern execution lifecycle
- **Agent Proxy**: Routes requests with load balancing
- **Confidence Tracker**: Historical confidence metrics
- **Pattern Registry**: Stores and versions patterns (enterprise)

## Development Workflow

### 1. Pattern Generation
```bash
# Initialize project
parallax init my-orchestration-project
cd my-orchestration-project

# Generate pattern interactively
parallax generate pattern --interactive

# Or from requirements
cat > requirements.yaml << EOF
name: pr-review
goal: "Multi-perspective pull request review"
strategy: parallel-consensus
minConfidence: 0.9
perspectives: [security, quality, performance]
EOF

parallax generate pattern -f requirements.yaml
```

### 2. Pattern Development
```
my-project/
├── agents/                     # Your agent implementations
├── patterns/                   # Generated patterns (like DB migrations)
│   ├── pr-review.prism
│   ├── data-pipeline.prism
│   └── consensus-escalation.prism
├── tests/
│   └── patterns/              # Pattern tests
├── parallax.config.yml        # Project configuration
└── package.json
```

### 3. Testing & Validation
```bash
# Test pattern locally
parallax test ./patterns/pr-review.prism --mock-agents

# Validate syntax and semantics
parallax validate ./patterns/pr-review.prism

# Run with local agents
parallax run pr-review --local
```

### 4. Production Deployment
```bash
# Patterns are deployed as files
# No runtime generation needed
docker build -t my-app .
docker run my-app parallax run pr-review
```

## Package Structure

```
parallax/
├── packages/
│   ├── pattern-sdk/         # Pattern generation toolkit (NEW)
│   │   ├── cli/            # CLI for pattern generation
│   │   ├── generator/      # Generation logic
│   │   └── templates/      # Pattern templates
│   │
│   ├── primitives/          # Composable building blocks (ENHANCED)
│   │   ├── execution/      # parallel, sequential, race
│   │   ├── aggregation/    # consensus, voting, merge
│   │   ├── confidence/     # threshold, transform
│   │   ├── control/        # retry, fallback, circuit
│   │   └── index.prism     # Primitive registry
│   │
│   ├── control-plane/       # Orchestration control
│   ├── data-plane/         # Execution and data flow
│   ├── runtime/            # Prism runtime integration
│   │
│   ├── sdk-typescript/     # TypeScript agent SDK
│   ├── sdk-python/         # Python agent SDK
│   ├── sdk-go/             # Go agent SDK
│   ├── sdk-rust/           # Rust agent SDK
│   │
│   └── marketplace/        # Pattern marketplace (NEW)
│       ├── registry/       # Pattern registry service
│       └── web/           # Marketplace UI
│
├── patterns/               # Example patterns (for reference)
├── examples/              # Example projects
└── docs/                  # Documentation
```

## Pattern Generation & Execution

### Generation Phase (Development Time)

```typescript
// Using Pattern SDK
import { PatternGenerator } from '@parallax/pattern-sdk';

const generator = new PatternGenerator({
  llm: userProvidedLLM,
  primitives: '@parallax/primitives'
});

const pattern = await generator.compose({
  goal: "Security review with escalation",
  strategy: "consensus",
  minConfidence: 0.9,
  fallback: "security-architect"
});

await generator.save(pattern, './patterns/security-review.prism');
```

### Generated Pattern Example

```prism
/**
 * @name SecurityReview
 * @version 1.0.0
 * @generated 2024-01-15
 * @description Security review with escalation
 */

import { parallel } from "@parallax/primitives/execution"
import { consensus } from "@parallax/primitives/aggregation"
import { threshold } from "@parallax/primitives/confidence"
import { escalate } from "@parallax/primitives/control"

// Parallel security analysis
securityResults = parallel(securityAgents)

// Build consensus
agreement = consensus(securityResults, 0.8)

// Apply confidence threshold
validated = threshold(agreement, 0.9)

// Escalate if needed
final = validated ~> 0.9 ? validated : escalate("security-architect")

// Return with confidence
final
```

### Execution Phase (Runtime)

```bash
# Pattern is loaded from file system
# No LLM needed at runtime
parallax run security-review --input '{
  "task": "Review PR #123",
  "code": "..."
}'
```

## Communication Flow

### Pattern Execution Flow

```
User Request → CLI/API → Pattern Engine → Load .prism file
                                              ↓
                                    Parse & Validate Pattern
                                              ↓
                                        Select Agents
                                              ↓
                         Data Plane → Execute Primitives → Agents
                                                              ↓
                                                       Execute Tasks
                                                              ↓
                         Results ← Confidence Aggregation ← Results
                            ↓
                     Response to User
```

### Pattern Development Flow

```
Requirements → Pattern SDK → LLM → Generate Pattern
                                        ↓
                                  Validate Pattern
                                        ↓
                                    Test Locally
                                        ↓
                                  Commit to Git
                                        ↓
                                  Deploy to Prod
```

## Deployment Modes

### Development Mode
```yaml
# Local development with generated patterns
PARALLAX_PATTERNS_DIR=./patterns
PARALLAX_LOCAL_AGENTS=agent1:8001,agent2:8002
parallax start --dev
```

### Production Mode (Open Source)
```yaml
# Docker deployment
FROM parallax/runtime:latest
COPY ./patterns /app/patterns
COPY ./agents /app/agents
CMD ["parallax", "start", "--patterns-dir", "/app/patterns"]
```

### Enterprise Mode
```yaml
# Kubernetes with pattern registry
apiVersion: apps/v1
kind: Deployment
spec:
  containers:
  - name: parallax
    image: parallax/enterprise:latest
    env:
    - name: PATTERN_REGISTRY_URL
      value: "https://patterns.company.com"
    - name: PARALLAX_LICENSE_KEY
      valueFrom:
        secretKeyRef:
          name: parallax-license
```

## Security Model

### Development Security
- Patterns are code-reviewed before deployment
- No runtime code generation
- Deterministic execution

### Runtime Security
- **Open Source**: Basic authentication, local trust
- **Enterprise**: mTLS, RBAC, SSO, audit logging

## Implementation Status

### ✅ Completed (v1)
- Control plane with pattern engine
- Data plane with execution engine
- Confidence propagation
- Language SDKs (TypeScript, Python, Go, Rust)
- Basic primitives

### 🚧 In Progress (v2)
- Pattern SDK with CLI
- Primitive library expansion
- Pattern testing framework
- Marketplace infrastructure

### 📋 Planned (v2)
- Visual pattern designer
- Pattern optimization tools
- Advanced primitives
- Pattern versioning system

## Future Directions

### Near Term
1. **Pattern SDK GA** - Complete SDK with all features
2. **Primitive Library** - Expand to 30+ primitives
3. **Marketplace Launch** - Community pattern sharing
4. **Testing Suite** - Comprehensive pattern testing

### Medium Term
1. **Visual Designer** - GUI for pattern creation
2. **Pattern Analytics** - Usage and performance metrics
3. **Advanced Primitives** - ML-optimized, domain-specific
4. **Multi-Region** - Global pattern distribution

### Long Term
1. **Pattern Optimization** - AI-assisted pattern improvement
2. **Domain Languages** - Industry-specific primitives
3. **Edge Execution** - Run patterns at the edge
4. **Federated Patterns** - Cross-organization sharing

## Key Advantages of v2

1. **True Open Source**: No runtime AI dependencies
2. **Developer Friendly**: Patterns as version-controlled code
3. **Production Ready**: Tested, deterministic patterns
4. **Community Driven**: Share and reuse patterns
5. **Cost Effective**: AI costs only during development
6. **Enterprise Ready**: Auditable, compliant patterns

## Migration from v1

```bash
# Convert existing patterns to use primitives
parallax migrate ./patterns/old-pattern.prism

# Or regenerate with SDK
parallax generate pattern --from-v1 consensus-builder
```

## Conclusion

Parallax v2 represents a fundamental shift in AI orchestration - from runtime AI dependency to development-time pattern generation. This architecture enables:

- Unlimited flexibility through primitive composition
- Zero runtime AI costs
- Community-driven pattern ecosystem
- Enterprise-grade reliability
- True open source sustainability

The future of AI orchestration is pattern-driven, community-powered, and truly open.
