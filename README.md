# Parallax

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/docs/static/img/parallax-DARK.png" />
    <img src="apps/docs/static/img/parallax-LIGHT.png" alt="Parallax Logo" width="320" />
  </picture>
</p>

<p align="center">
  <strong>Multi-agent orchestration for reliable AI systems</strong>
</p>

<p align="center">
  <a href="https://parallaxai.dev">Website</a> ·
  <a href="https://docs.parallaxai.dev">Docs</a> ·
  <a href="https://builder.parallaxai.dev">Pattern Builder</a>
</p>

---

## What is Parallax?

Parallax is an orchestration layer for AI agents. It coordinates multiple models or services, applies consensus and quality gates, and produces confidence-scored results that are suitable for production workflows.

You can define orchestration flows in YAML or visually using the Pattern Builder, then execute them against your agents with deterministic aggregation and validation.

## Highlights

- **Multi-agent orchestration**: Consensus, voting, merge, and verification patterns.
- **Confidence scoring**: Quantify uncertainty and enforce thresholds.
- **Pattern Builder**: Visual editor + YAML export.
- **Agent runtimes**: Local, Docker, and Kubernetes support.
- **Language agnostic**: Agents can be written in any language.

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 10.11.0
- Docker (for etcd and optional services)

### Install & build

```bash
pnpm install
pnpm build
```

### Run locally

```bash
pnpm start
```

### Try a demo

```bash
pnpm run demo:patterns
```

## Core Concepts

- **Patterns** define orchestration graphs.
- **Agents** execute tasks and return results with confidence.
- **Aggregation** merges or votes across outputs.
- **Validation** enforces quality gates and thresholds.

For the authoritative guide, see the docs:

- https://docs.parallaxai.dev

## Repository Structure

```
parallax/
├── apps/
│   ├── docs/             # Documentation site
│   ├── marketing/        # Marketing site
│   ├── builder/          # Pattern Builder app
│   └── web-dashboard/    # Web dashboard
├── packages/
│   ├── control-plane/    # Pattern engine + runtime integration
│   ├── runtime/          # Core runtime services
│   ├── pattern-builder/  # Builder UI package
│   ├── sdk-typescript/   # TypeScript SDK
│   └── sdk-python/       # Python SDK
├── patterns/             # Example patterns
└── docs/                 # Internal docs and design notes
```

## Links

- Website: https://parallaxai.dev
- Docs: https://docs.parallaxai.dev
- Pattern Builder: https://builder.parallaxai.dev
- GitHub: https://github.com/HaruHunab1320/parallax
- Discord: https://discord.gg/jdjqvMa2
- X: https://x.com/Parallax__AI

## License

Apache 2.0
