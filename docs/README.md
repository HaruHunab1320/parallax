# Parallax Documentation

## Quick Links

- [Getting Started Guide](./GETTING_STARTED.md)
- [Coordination Patterns](./patterns/README.md)
- [API Reference](./api/README.md)
- [Agent Runtime Plan](./AGENT_RUNTIME_SUPPORT_DEVELOPMENT.md)
- [Architecture](./ARCHITECTURE.md)
- [Confidence](./CONFIDENCE.md)
- [Verification](./VERIFY.md)
- [Testing Guide](./TESTING_GUIDE.md)
- [Thread Runtime Proposal](./THREAD_RUNTIME_PROPOSAL.md) (archived)
- [Thread Runtime Implementation Plan](./THREAD_RUNTIME_IMPLEMENTATION_PLAN.md) (archived)
- [Orchestration Patterns](./ORCHESTRATION_PATTERNS.md) (archived)
- [Pattern SDK Architecture](./PATTERN_SDK_ARCHITECTURE.md) (archived)

## Overview

Parallax is an AI agent orchestration platform for coding-agent orchestration (Claude Code, Codex, Gemini, Aider across local, Docker, K8s, and gateway runtimes). Orchestration patterns are authored as TypeScript patterns and org-chart YAML, with verification-driven confidence routing deciding when work is accepted, retried, or escalated.

Recent architecture work adds managed threads as a first-class orchestration unit for long-lived coding work, workspace-aware supervision, and compressed memory reuse across runs.

## Core Concepts

1. **Patterns** - Orchestration authored as TypeScript modules (`packages/patterns`, `@parallaxai/patterns`, `execute(ctx)`) or org-chart YAML (`patterns/org-*.yaml`) run by the workflow executor
2. **Verification-driven Confidence** - Triage that runs a cheap oracle (tests/compile), then a structural acceptance check, then a second agent, then human escalation; `@parallaxai/confidence` provides the algebra (see [CONFIDENCE.md](./CONFIDENCE.md), [VERIFY.md](./VERIFY.md))
3. **Coordination Patterns** - Reusable patterns for common orchestration needs
4. **Agent Independence** - Building focused, simple agents that do one thing well
5. **Managed Threads** - Long-lived supervised CLI-agent work streams above concrete runtime sessions

## Documentation Structure

- **Concepts** - Fundamental ideas behind Parallax
- **Guides** - Step-by-step tutorials
- **Patterns** - Coordination pattern reference
- **SDKs** - Building agents in TypeScript and Python
- **API Reference** - Detailed API documentation

## Architecture

See [PLATFORM_BLUEPRINT.md](../PLATFORM_BLUEPRINT.md) for the complete architectural vision.

For current implementation details, use:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [CONFIDENCE.md](./CONFIDENCE.md)
- [VERIFY.md](./VERIFY.md)

The thread runtime proposal and implementation plan ([THREAD_RUNTIME_PROPOSAL.md](./THREAD_RUNTIME_PROPOSAL.md), [THREAD_RUNTIME_IMPLEMENTATION_PLAN.md](./THREAD_RUNTIME_IMPLEMENTATION_PLAN.md)) are archived, pre-refocus planning docs kept for history.
