# Getting Started with Parallax

## Quick Start - Simple Demo (No Infrastructure Required)

The easiest way to see Parallax in action:

```bash
npm run demo:simple
```

This runs a self-contained demo showing multi-agent coordination without needing any external services.

## Development Commands

```bash
# Build all packages
npm run build

# Run specific services in dev mode
npm run dev:control-plane  # Start the control plane
npm run dev:web           # Start the web dashboard

# Run demos
npm run demo:simple      # Simple standalone demo
npm run demo            # Agent implementation demo  
npm run demo:patterns   # Pattern orchestration demo
```

## Full Platform Setup

To run the complete Parallax platform with all features:

### 1. Start the Platform
```bash
npm run start
# or
./start-local.sh
```

This will:
- Start etcd (using Docker) for service discovery
- Build all packages
- Start the Control Plane
- Start example agents
- Set up the complete infrastructure

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