# Parallax Documentation

## Quick Links

- [Getting Started Guide](./guides/getting-started.md)
- [Orchestra Philosophy](./concepts/orchestra-philosophy.md) 🎼
- [Coordination Patterns](./patterns/README.md)
- [API Reference](./api/README.md)
- [Agent Runtime Plan](./AGENT_RUNTIME_SUPPORT_DEVELOPMENT.md)
- [Architecture](./ARCHITECTURE.md)
- [Thread Runtime Proposal](./THREAD_RUNTIME_PROPOSAL.md)
- [Thread Runtime Implementation Plan](./THREAD_RUNTIME_IMPLEMENTATION_PLAN.md)
- [Testing Guide](./TESTING_GUIDE.md)

## Overview

Parallax is an AI agent orchestration platform that coordinates swarms of specialized agents using the Prism uncertainty-aware language. Built on the "orchestra philosophy" where agents focus on their expertise while Parallax conducts their collective intelligence.

Recent architecture work adds managed threads as a first-class orchestration unit for long-lived coding work, workspace-aware supervision, and compressed memory reuse across runs.

## Core Concepts

1. **[Orchestra Philosophy](./concepts/orchestra-philosophy.md)** - Why agents work better when they don't talk to each other
2. **Uncertainty Programming** - Using Prism's confidence operators (`~`, `~>`) 
3. **Coordination Patterns** - Reusable patterns for common orchestration needs
4. **Agent Independence** - Building focused, simple agents that do one thing well
5. **Managed Threads** - Long-lived supervised work streams above concrete runtime sessions

## Documentation Structure

- **Concepts** - Fundamental ideas behind Parallax
- **Guides** - Step-by-step tutorials
- **Patterns** - Coordination pattern reference
- **SDKs** - Building agents in TypeScript and Python
- **API Reference** - Detailed API documentation

## Architecture

See [PLATFORM_BLUEPRINT.md](../PLATFORM_BLUEPRINT.md) for the complete architectural vision.

For the current implementation details of managed threads, use:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [THREAD_RUNTIME_PROPOSAL.md](./THREAD_RUNTIME_PROPOSAL.md)
- [THREAD_RUNTIME_IMPLEMENTATION_PLAN.md](./THREAD_RUNTIME_IMPLEMENTATION_PLAN.md)
