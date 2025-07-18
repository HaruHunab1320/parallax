# Parallax Package Architecture

## Overview

The Parallax platform is organized as a monorepo with multiple packages that work together to provide a complete AI orchestration solution. Each package has a specific responsibility and clear interfaces.

## Package Dependency Graph

```
                            ┌─────────────┐
                            │   @proto    │
                            │ (Protocol)  │
                            └──────┬──────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
              ┌─────▼─────┐                 ┌────▼─────┐
              │ @security │                 │@telemetry│
              │  (mTLS)   │                 │(Metrics) │
              └─────┬─────┘                 └────┬─────┘
                    │                             │
                    └──────────┬──────────────────┘
                               │
                         ┌─────▼─────┐
                         │ @runtime  │
                         │  (Core)   │
                         └─────┬─────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
           ┌─────▼──────┐            ┌──────▼──────┐
           │@control-plane│          │ @data-plane │
           │(Orchestration)│         │ (Execution) │
           └─────┬──────┘            └──────┬──────┘
                 │                           │
                 └─────────┬─────────────────┘
                           │
                     ┌─────▼─────┐
                     │   @cli    │
                     │(Interface)│
                     └───────────┘

    ┌────────┐  ┌────────┐  ┌─────────┐  ┌──────────┐
    │  @auth │  │@tenant │  │ SDK-TS  │  │ SDK-PY   │
    │ (RBAC) │  │(Multi) │  │(Client) │  │(Client)  │
    └────────┘  └────────┘  └─────────┘  └──────────┘
```

## Core Packages

### 1. @parallax/proto
**Purpose**: Protocol definitions and type generation  
**Location**: `/packages/proto`
- Defines gRPC service contracts
- Generates TypeScript types from protobuf
- Shared between all services and SDKs
- Key file: `proto/confidence.proto`

### 2. @parallax/runtime
**Purpose**: Core orchestration runtime  
**Location**: `/packages/runtime`
- Agent registry and discovery
- Confidence protocol implementation
- Coordinator for multi-agent orchestration
- Agent proxy for secure communication
- Integrates with @prism-lang for AI capabilities

### 3. @parallax/control-plane
**Purpose**: Platform control and management  
**Location**: `/packages/control-plane`
- Pattern engine for executing coordination patterns
- License enforcement (enterprise features)
- Health monitoring
- Registry integration (etcd)
- HTTP/gRPC API server
- Integrates Prism runtime for pattern execution

### 4. @parallax/data-plane
**Purpose**: Execution and data flow management  
**Location**: `/packages/data-plane`
- Agent proxy with load balancing
- Circuit breaker for fault tolerance
- Execution engine with caching
- Confidence tracking and storage (InfluxDB)
- Parallel execution coordinator

## Infrastructure Packages

### 5. @parallax/security
**Purpose**: Security infrastructure  
**Location**: `/packages/security`
- mTLS certificate management
- Credentials provider
- Certificate generation scripts
- Secure communication channels

### 6. @parallax/telemetry
**Purpose**: Observability and monitoring  
**Location**: `/packages/telemetry`
- OpenTelemetry integration
- Distributed tracing
- Pattern execution tracing
- Metrics collection

### 7. @parallax/auth
**Purpose**: Authentication and authorization  
**Location**: `/packages/auth`
- JWT token management
- OAuth2 provider integration
- RBAC permissions system
- Middleware for Express

### 8. @parallax/tenant
**Purpose**: Multi-tenancy support  
**Location**: `/packages/tenant`
- Tenant isolation
- Resource quotas
- Rate limiting per tenant
- Data isolation

## Client Packages

### 9. @parallax/cli
**Purpose**: Command-line interface  
**Location**: `/packages/cli`
- Commands: agent, pattern, run, start, status
- Connects to control plane API
- Local development workflow

### 10. @parallax/sdk-typescript
**Purpose**: TypeScript/JavaScript SDK  
**Location**: `/packages/sdk-typescript`
- Agent base class
- Decorators for agent methods
- gRPC server implementation
- Type definitions
- Web dashboard (React app)
- Kubernetes resources (Helm charts, CRDs)

### 11. Python SDK
**Purpose**: Python agent development  
**Location**: `/packages/sdk-python`
- ParallaxAgent base class
- Decorators for confidence
- gRPC server wrapper
- Proto generation scripts

### 12. Go SDK
**Purpose**: Go agent development  
**Location**: `/packages/sdk-go`
- Agent interface
- Pattern client
- Example implementations

### 13. Rust SDK
**Purpose**: High-performance agents  
**Location**: `/packages/sdk-rust`
- Async agent trait
- Tokio-based runtime
- gRPC with tonic

## Key Integrations

### Prism Language Suite
The control plane integrates three Prism packages:
- `@prism-lang/core`: Core language runtime
- `@prism-lang/confidence`: Confidence propagation
- `@prism-lang/llm`: LLM integration patterns

### External Services
- **etcd**: Service registry and coordination
- **InfluxDB**: Time-series confidence data
- **Prometheus**: Metrics collection
- **Jaeger**: Distributed tracing

## Communication Flow

1. **Agents** register with the **control plane** via gRPC
2. **Control plane** stores registration in **etcd**
3. **Patterns** execute through the **pattern engine**
4. **Data plane** proxies agent communication
5. **Telemetry** tracks execution across services
6. **Security** ensures mTLS between all components

## Development Workflow

1. **Local Development**:
   ```bash
   parallax start        # Starts control plane
   parallax agent list   # Shows registered agents
   parallax run <pattern> # Executes patterns
   ```

2. **Agent Development**:
   - Choose SDK (TypeScript, Python, Go, Rust)
   - Extend base agent class
   - Implement analyze methods
   - Register with platform

3. **Pattern Development**:
   - Write patterns in Prism language
   - Place in `/patterns` directory
   - Test with `parallax pattern validate`
   - Execute with `parallax run`

## Enterprise Features

The architecture supports enterprise features through:
- **License enforcement** in control plane
- **Multi-tenancy** via tenant package
- **Advanced security** with mTLS/RBAC
- **Kubernetes deployment** via Helm charts
- **Persistence** with external databases
- **High availability** with clustering

This modular architecture allows the open-source version to run locally with full functionality while enterprise deployments can scale with additional infrastructure components.