# Contributing to Parallax

Welcome to the Parallax contributor documentation! This section covers how to contribute to the project, including our package extraction roadmap for creating standalone, reusable components.

## Ways to Contribute

### 1. Report Issues
Found a bug or have a feature request? [Open an issue](https://github.com/HaruHunab1320/parallax/issues) on GitHub.

### 2. Submit Pull Requests
We welcome contributions! Please read our [contribution guidelines](https://github.com/HaruHunab1320/parallax/blob/main/CONTRIBUTING.md) before submitting PRs.

### 3. Package Extraction
We're actively extracting reusable components into standalone npm packages. See the [Package Extraction Roadmap](./package-extraction) for details on how to help.

### 4. Documentation
Help improve our docs by submitting corrections or adding examples.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/HaruHunab1320/parallax.git
cd parallax

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start local development
pnpm dev
```

## Project Structure

```
parallax/
├── apps/
│   ├── docs/                 # Documentation site (you are here)
│   └── web-dashboard/        # Web UI
├── packages/
│   ├── control-plane/        # Orchestration & API (incl. org-patterns compiler)
│   ├── data-plane/           # Execution engine
│   ├── patterns/             # TypeScript orchestration patterns (@parallaxai/patterns)
│   ├── confidence/           # Confidence algebra (@parallaxai/confidence)
│   ├── runtime-local/        # Local PTY runtime
│   ├── runtime-docker/       # Docker runtime
│   ├── runtime-k8s/          # Kubernetes runtime
│   └── sdk-typescript/       # TypeScript SDK
└── k8s/                      # Kubernetes deployment
```

## Package Extraction Initiative

We've extracted battle-tested agent-tooling components into standalone npm
packages, which parallax now consumes from npm like any other dependency:

| Package | Status | Repo |
|---------|--------|------|
| `pty-manager` | Done / extracted | [HaruHunab1320/pty-manager](https://github.com/HaruHunab1320/pty-manager) |
| `coding-agent-adapters` | Done / extracted | [HaruHunab1320/coding-agent-adapters](https://github.com/HaruHunab1320/coding-agent-adapters) |
| `pty-console` | Done / extracted | [HaruHunab1320/pty-console](https://github.com/HaruHunab1320/pty-console) |
| `pty-state-capture` | Done / extracted | [HaruHunab1320/pty-state-capture](https://github.com/HaruHunab1320/pty-state-capture) |
| `tmux-manager` | Done / extracted | [HaruHunab1320/tmux-manager](https://github.com/HaruHunab1320/tmux-manager) |
| `adapter-types` | Done / extracted | [HaruHunab1320/adapter-types](https://github.com/HaruHunab1320/adapter-types) |
| `git-workspace-service` | Done / extracted | [HaruHunab1320/git-workspace-service](https://github.com/HaruHunab1320/git-workspace-service) |

Some previously planned extractions (`pattern-builder`, `org-chart-compiler`,
`primitives`, `pattern-sdk`) have been removed rather than extracted. The
org-chart compiler now lives inside the control plane (`org-patterns`), and
orchestration patterns are TypeScript modules in `packages/patterns`.

## Code Style

- TypeScript for all packages
- ESLint + Prettier for formatting
- Vitest for testing
- Conventional commits for commit messages

```bash
# Format code
pnpm format

# Run linter
pnpm lint

# Type check
pnpm type-check
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test -- path/to/test.ts

# Run runtime integration tests
pnpm test:runtime
```

## Community

- [GitHub Discussions](https://github.com/HaruHunab1320/parallax/discussions)
- [Discord](https://discord.gg/jdjqvMa2)
- [X/Twitter](https://x.com/Parallax__AI)

## License

Parallax is open source under the MIT license.
