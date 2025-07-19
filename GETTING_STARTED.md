# Getting Started with Parallax

## 🚀 Quick Start - One Command!

```bash
npm start
```

That's it! This starts:
- ✅ etcd (service registry)
- ✅ Control Plane API (port 8080)
- ✅ Ready for agents and patterns

Then run a demo:
```bash
npm run demo:patterns
```

## 📋 All Startup Options

### Basic Development (Default)
```bash
npm start              # or npm run dev
# Minimal setup: etcd + control plane
```

### Development with Monitoring
```bash
npm run dev:monitor
# Includes: Prometheus, Grafana, Jaeger
# Grafana: http://localhost:3000 (admin/admin)
```

### Full Development Stack
```bash
npm run dev:full
# Includes: PostgreSQL, Redis, all monitoring
# Perfect for feature development
```

### Production-like Local
```bash
npm run dev:prod
# Everything containerized like production
# Tests production configs locally
```

## 🎮 Running Demos

```bash
# Pattern orchestration demo (recommended)
npm run demo:patterns

# Simple agent coordination
npm run demo:simple

# Full demo application
npm run demo
```

## 🏗️ Starting Individual Components

```bash
# Infrastructure
npm run infra:etcd      # Just etcd
npm run infra:postgres   # Just PostgreSQL  
npm run infra:all       # All infrastructure

# Services
npm run control-plane    # Control plane only
npm run web             # Web dashboard only
npm run monitor:start   # Monitoring stack only

# Stop everything
npm run stop:all
```

### 2. Run Demos

In another terminal, you can run:

```bash
# Pattern orchestration demo (requires full platform)
npm run demo:patterns

# Agent implementation demo
npm run demo
```

## Understanding the Demos

### Simple Demo (`demo:simple`)
- **What**: Basic multi-agent coordination
- **Requirements**: None - runs standalone
- **Shows**: Core concepts without infrastructure

### Pattern Demo (`demo:patterns`)
- **What**: High-level pattern orchestration
- **Requirements**: Full platform (etcd + agents)
- **Shows**: .prism pattern files, PatternEngine, service discovery

### Demo App (`demo`)
- **What**: Low-level agent implementation
- **Requirements**: None for basic, full platform for advanced features
- **Shows**: How to build custom agents

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐
│   Pattern Demo  │     │    Demo App     │
│  (High-level)   │     │   (Low-level)   │
└────────┬────────┘     └────────┬────────┘
         │                       │
    ┌────▼──────────────────────▼────┐
    │        Control Plane           │
    │  (PatternEngine, Registry)     │
    └────────────────┬───────────────┘
                     │
         ┌───────────▼───────────┐
         │        etcd           │
         │  (Service Discovery)  │
         └───────────┬───────────┘
                     │
    ┌────────────────▼───────────────┐
    │           Agents               │
    │  (Security, Performance, etc)  │
    └────────────────────────────────┘
```

## Troubleshooting

### Docker not found
- Install Docker from https://docker.com

### Port already in use
- etcd uses port 2379
- Control Plane uses port 3000
- Kill existing processes or change ports

### Build errors
- Run `npm run build` to ensure all packages are built
- Run `npm run type-check` to check for TypeScript errors

## Next Steps

1. Try the simple demo first to understand concepts
2. Run the full platform to see everything working together
3. Explore the pattern files in `/patterns/*.prism`
4. Build your own agents and patterns!