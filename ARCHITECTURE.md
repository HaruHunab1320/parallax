# Parallax Architecture

> **Single Source of Truth** - This document consolidates all architectural information for the Parallax AI orchestration platform.

## Table of Contents

1. [Overview](#overview)
2. [Core Principles](#core-principles)
3. [System Architecture](#system-architecture)
4. [Package Structure](#package-structure)
5. [Communication Flow](#communication-flow)
6. [Deployment Modes](#deployment-modes)
7. [Security Model](#security-model)
8. [Implementation Status](#implementation-status)
9. [Enterprise Features](#enterprise-features)
10. [Future Directions](#future-directions)

## Overview

Parallax is an AI orchestration platform that coordinates agent swarms using uncertainty-aware patterns written in the Prism language. It provides a complete ecosystem for building, deploying, and managing multi-agent AI systems with confidence-based decision making.

### Key Differentiators

- **Uncertainty-aware**: All decisions include confidence scores (0.0-1.0)
- **Language agnostic**: Agents can be written in any language
- **Pattern-based**: Reusable coordination patterns for common scenarios
- **Production-ready**: Built-in observability, security, and scaling

## Core Principles

### 1. Uncertainty as First-Class Citizen
```prism
// Confidence propagates through all operations
result = agent.analyze(task) ~> 0.85
decision = uncertain if (result.confidence > threshold) {
  high { proceed() }
  medium { gather_more_data() }
  low { escalate_to_human() }
}
```

### 2. Separation of Concerns
- **Coordination Logic**: Runs in control plane using Prism
- **Business Logic**: Lives in agents using any language
- **Infrastructure**: Handled by platform (scaling, security, monitoring)

### 3. Orchestra Philosophy
Like an orchestra where musicians (agents) play their instruments (specialized skills) while the conductor (Parallax) coordinates the performance (pattern execution).

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                        │
│  CLI | Web Dashboard | API Clients | Language SDKs         │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP/gRPC
┌───────────────────────┴─────────────────────────────────────┐
│                      Control Plane                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │Pattern Engine│  │Runtime Manager│  │Service Registry │   │
│  │             │  │(Prism Runtime)│  │    (etcd)       │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Licensing  │  │Health Monitor│  │ Metrics Collector│   │
│  │  Enforcer   │  │              │  │                 │   │
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
│  │Result Cache │  │Circuit Breaker│  │ Parallel Exec  │   │
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

#### Control Plane
- **Pattern Engine**: Loads and executes .prism coordination patterns
- **Runtime Manager**: Integrates Prism language runtime with confidence
- **Service Registry**: Agent discovery and health monitoring
- **License Enforcer**: Feature flags for open source vs enterprise

#### Data Plane
- **Execution Engine**: Manages pattern execution lifecycle
- **Agent Proxy**: Routes requests with load balancing
- **Confidence Tracker**: Historical confidence metrics
- **Circuit Breaker**: Fault tolerance and recovery
- **Result Cache**: Intelligent caching with confidence decay

#### Agent Layer
- **Language SDKs**: Base classes and utilities for each language
- **gRPC Server**: Built into each agent for communication
- **Health Checks**: Liveness and readiness reporting

## Package Structure

```
parallax/
├── packages/
│   ├── control-plane/        # Orchestration control
│   ├── data-plane/          # Execution and data flow
│   ├── runtime/             # Core runtime components
│   ├── proto/               # Protocol definitions
│   ├── cli/                 # Command-line interface
│   │
│   ├── sdk-typescript/      # TypeScript agent SDK
│   ├── sdk-python/          # Python agent SDK
│   ├── sdk-go/              # Go agent SDK
│   ├── sdk-rust/            # Rust agent SDK
│   │
│   ├── security/            # mTLS and certificates
│   ├── auth/                # Authentication/RBAC
│   ├── telemetry/           # OpenTelemetry integration
│   ├── tenant/              # Multi-tenancy support
│   │
│   ├── web-dashboard/       # Web UI (to be separated)
│   ├── k8s-deployment/      # Kubernetes resources (to be separated)
│   └── monitoring/          # Grafana/Prometheus (to be separated)
│
├── patterns/                # Coordination patterns (.prism files)
├── examples/                # Example agents and patterns
└── docs/                    # Documentation
```

### Package Dependencies

```
                    @parallax/proto
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
  @parallax/security  @parallax/telemetry   │
        │                 │                 │
        └─────────┬───────┴─────────────────┘
                  │
            @parallax/runtime
                  │
      ┌───────────┴───────────┐
      │                       │
@parallax/control-plane  @parallax/data-plane
      │                       │
      └───────────┬───────────┘
                  │
            @parallax/cli
```

## Communication Flow

### 1. Pattern Execution Flow
```
User Request → CLI/API → Control Plane → Pattern Engine
                                              ↓
                                        Load Pattern
                                              ↓
                                        Select Agents
                                              ↓
                         Data Plane → Agent Proxies → Agents
                                                        ↓
                                                 Execute Tasks
                                                        ↓
                         Results ← Confidence Aggregation
                            ↓
                        Response
```

### 2. Agent Registration
```
Agent Startup → gRPC Server → Register with Control Plane
                                         ↓
                               Update Service Registry
                                         ↓
                               Health Check Loop
```

### 3. Confidence Protocol
All agent responses follow this structure:
```protobuf
message ConfidenceResult {
  google.protobuf.Any value = 1;      // Actual result
  double confidence = 2;               // 0.0 to 1.0
  string reasoning = 3;                // Explanation
  int64 timestamp = 4;                 // When computed
  map<string, double> confidence_factors = 5; // Breakdown
}
```

## Deployment Modes

### Development Mode (Open Source)
```yaml
# Single machine deployment
PARALLAX_LOCAL_AGENTS=weather:8001,analyzer:8002,validator:8003
parallax start

# Features:
- Unlimited local agents
- All core patterns
- In-memory state
- Local development
```

### Production Mode (Enterprise)
```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: parallax-control-plane
spec:
  replicas: 3  # High availability
  template:
    spec:
      containers:
      - name: control-plane
        image: parallax/control-plane:latest
        env:
        - name: PARALLAX_LICENSE_KEY
          valueFrom:
            secretKeyRef:
              name: parallax-license
              key: key
```

## Security Model

### Open Source Security
- Local trust model
- Basic authentication
- No network encryption
- Suitable for development

### Enterprise Security
- **mTLS**: All service-to-service communication
- **RBAC**: Fine-grained permissions
- **SSO Integration**: SAML/OAuth2
- **Audit Logging**: Complete audit trail
- **Secrets Management**: Kubernetes secrets
- **Network Policies**: Zero-trust networking

## Implementation Status

### ✅ Completed Features

#### Core Platform
- [x] Control plane with pattern engine
- [x] Data plane with execution engine
- [x] All 11+ coordination patterns
- [x] Confidence propagation
- [x] Agent registry (etcd)
- [x] Circuit breaker & retry logic
- [x] Result caching

#### Language Support
- [x] TypeScript SDK (full gRPC support)
- [x] Python SDK (full gRPC support)
- [x] Go SDK (full gRPC support)
- [x] Rust SDK (full gRPC support)
- [x] CLI tool

#### Infrastructure
- [x] Health monitoring
- [x] License enforcement
- [x] Basic metrics
- [x] OpenTelemetry integration
- [x] mTLS support
- [x] RBAC framework

### 🚧 In Progress

#### High Priority
- [x] HTTP REST API (complete with OpenAPI docs)
- [x] Persistence layer (PostgreSQL/TimescaleDB)
- [x] Docker images (multi-stage builds)
- [x] Integration tests (comprehensive suite)

#### Medium Priority
- [x] Web dashboard (integrated)
- [x] Kubernetes operators (Helm charts ready)
- [x] Grafana dashboards (4 comprehensive dashboards)
- [ ] Advanced patterns (ML-optimized)

### 📋 Planned Features

#### Production Readiness
- [ ] High availability
- [ ] Backup/restore
- [ ] Multi-region support
- [ ] Disaster recovery

#### Advanced Features
- [ ] Pattern marketplace
- [ ] Visual pattern designer
- [ ] A/B testing framework
- [ ] ML-based optimization

## Enterprise Features

Open source provides the complete platform for local development. Enterprise adds production-grade infrastructure:

### Infrastructure & Operations
- **Kubernetes Native**: Operators, auto-scaling, multi-region
- **Persistence**: PostgreSQL/TimescaleDB for history
- **High Availability**: Multi-master, automatic failover
- **Monitoring**: Full dashboard, alerting, SLAs

### Security & Compliance
- **Advanced Security**: mTLS, RBAC, SSO, audit logs
- **Compliance**: SOC2, HIPAA ready
- **Data Governance**: Retention, encryption, isolation

### Team Features
- **Multi-tenancy**: Namespace isolation, quotas
- **Collaboration**: Shared patterns, team workspaces
- **Analytics**: Usage tracking, cost allocation

### Support
- **Professional Support**: Email/phone with SLAs
- **Training**: Workshops and certification
- **Consulting**: Architecture reviews

## Future Directions

### Near Term (3-6 months)
1. **Production Hardening**: HA, persistence, monitoring
2. **Pattern Ecosystem**: Marketplace, versioning
3. **Developer Experience**: Better debugging, testing

### Medium Term (6-12 months)
1. **Advanced Patterns**: ML integration, complex workflows
2. **Global Scale**: Multi-region federation
3. **Enterprise Integration**: SAP, Salesforce connectors

### Long Term (12+ months)
1. **AI-Optimized Patterns**: Self-tuning coordination
2. **Edge Deployment**: Run patterns at the edge
3. **Quantum Ready**: Prepare for quantum computing

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Architecture decisions
- Adding new patterns
- Creating language SDKs
- Security considerations

## References

- [Prism Language Documentation](https://prism-lang.org)
- [gRPC Best Practices](https://grpc.io/docs/guides/performance/)
- [Kubernetes Operators](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/)
- [OpenTelemetry](https://opentelemetry.io/)