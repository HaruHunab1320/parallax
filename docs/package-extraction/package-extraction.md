# Package Extraction Roadmap

Parallax contains several battle-tested components that have strong standalone value. This document outlines our strategy for extracting these into independent npm packages that can benefit the broader community while improving Parallax's modularity.

## Overview

We've identified **5 components** with high reusability potential:

| Package | Current Location | Extraction Difficulty | Timeline |
|---------|-----------------|----------------------|----------|
| [Circuit Breaker](./packages/circuit-breaker) | `data-plane/agent-proxy/` | Trivial | Phase 1 |
| [Confidence Tracker](./packages/confidence-tracker) | `data-plane/confidence-tracker/` | Easy | Phase 1 |
| [PTY Agent Manager](./packages/pty-agent-manager) | `runtime-local/pty/` | Medium | Phase 2 |
| [Org Chart Compiler](./packages/org-chart-compiler) | `control-plane/org-patterns/` | Medium-Hard | Phase 3 |
| [Git Workspace Service](./packages/git-workspace-service) | `control-plane/workspace/` | Hard | Phase 3 |

## Extraction Strategy

### Principles

1. **Build in Parallel** - New packages are developed alongside existing code
2. **No Breaking Changes** - Parallax continues using internal implementations until packages are stable
3. **Interface First** - Define clean APIs before extraction
4. **Gradual Migration** - Swap internal code for packages incrementally

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Parallax Core                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ control-plane │  │  data-plane  │  │runtime-local │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│         ▼                 ▼                 ▼                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Internal Implementations (Current)           │   │
│  │  • CircuitBreaker  • ConfidenceTracker  • PTYManager     │   │
│  │  • OrgChartCompiler • WorkspaceService                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Phase 1-3: Extract & Publish
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Standalone Packages (npm)                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │@parallax/      │  │@parallax/      │  │@parallax/      │     │
│  │circuit-breaker │  │confidence-     │  │pty-agent-      │     │
│  │                │  │tracker         │  │manager         │     │
│  └────────────────┘  └────────────────┘  └────────────────┘     │
│  ┌────────────────┐  ┌────────────────┐                         │
│  │@parallax/      │  │@parallax/      │                         │
│  │org-chart-      │  │git-workspace-  │                         │
│  │compiler        │  │service         │                         │
│  └────────────────┘  └────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ After Stable Release
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Parallax Core (Updated)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ control-plane │  │  data-plane  │  │runtime-local │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│         ▼                 ▼                 ▼                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Dependencies on Published Packages                │   │
│  │  "@parallax/circuit-breaker": "^1.0.0"                    │   │
│  │  "@parallax/confidence-tracker": "^1.0.0"                 │   │
│  │  "@parallax/pty-agent-manager": "^1.0.0"                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Development Phases

### Phase 1: Quick Wins (Week 1-2)

**Goal:** Extract trivial/easy packages to establish patterns

| Package | LOC | Dependencies | Status |
|---------|-----|--------------|--------|
| Circuit Breaker | ~100 | None | Ready |
| Confidence Tracker | ~450 | EventEmitter, InfluxDB (optional) | Ready |

**Deliverables:**
- [ ] Standalone package repos or monorepo structure
- [ ] Full test coverage
- [ ] npm publication under `@parallax/` scope
- [ ] Migration guide for Parallax internals

### Phase 2: Core Components (Week 3-4)

**Goal:** Extract the PTY system - highest community value

| Package | LOC | Dependencies | Status |
|---------|-----|--------------|--------|
| PTY Agent Manager | ~800 | node-pty, EventEmitter | Needs interface extraction |

**Deliverables:**
- [ ] Abstract adapter interface (CLI-agnostic)
- [ ] Built-in adapters: echo, shell
- [ ] Plugin system for custom adapters
- [ ] Example adapters: claude, codex, aider

### Phase 3: Complex Systems (Week 5-8)

**Goal:** Extract systems with deeper dependencies

| Package | LOC | Dependencies | Status |
|---------|-----|--------------|--------|
| Org Chart Compiler | ~500 | js-yaml | Needs runtime abstraction |
| Git Workspace Service | ~400 | git CLI, GitHub API | Needs credential abstraction |

**Deliverables:**
- [ ] Pluggable runtime targets for org-chart
- [ ] Credential provider interface
- [ ] GitHub, GitLab, Bitbucket support

## Package Structure

Each extracted package follows this structure:

```
@parallax/package-name/
├── src/
│   ├── index.ts           # Public API exports
│   ├── types.ts           # TypeScript interfaces
│   └── ...                # Implementation
├── tests/
│   ├── unit/
│   └── integration/
├── examples/
│   └── basic-usage.ts
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
└── LICENSE                # MIT
```

## Success Criteria

Each package must meet these criteria before publication:

1. **Zero Parallax Dependencies** - No imports from `@parallax/*` internal packages
2. **100% Test Coverage** - Unit tests for all public APIs
3. **TypeScript Support** - Full type definitions
4. **Documentation** - README with examples, API reference
5. **Semantic Versioning** - Following semver strictly
6. **CI/CD** - Automated testing and publishing

## Migration Process

When swapping internal code for published packages:

1. **Add Dependency** - `pnpm add @parallax/package-name`
2. **Update Imports** - Change internal imports to package imports
3. **Run Tests** - Ensure all existing tests pass
4. **Remove Internal Code** - Delete the extracted source files
5. **Update Docs** - Reference the standalone package

## Contributing

Want to help extract a package? See the individual development plans:

- [Circuit Breaker Development Plan](./packages/circuit-breaker)
- [Confidence Tracker Development Plan](./packages/confidence-tracker)
- [PTY Agent Manager Development Plan](./packages/pty-agent-manager)
- [Org Chart Compiler Development Plan](./packages/org-chart-compiler)
- [Git Workspace Service Development Plan](./packages/git-workspace-service)
