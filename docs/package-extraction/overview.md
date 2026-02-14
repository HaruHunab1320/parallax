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
│   ├── web-dashboard/        # Web UI
│   └── pattern-builder/      # Visual pattern editor
├── packages/
│   ├── control-plane/        # Orchestration & API
│   ├── data-plane/           # Execution engine
│   ├── runtime-local/        # Local PTY runtime
│   ├── runtime-docker/       # Docker runtime
│   ├── runtime-k8s/          # Kubernetes runtime
│   ├── sdk-typescript/       # TypeScript SDK
│   └── prism/                # Prism DSL compiler
└── k8s/                      # Kubernetes deployment
```

## Package Extraction Initiative

We're extracting battle-tested components into standalone npm packages:

| Package | Status | Docs |
|---------|--------|------|
| `@parallax/circuit-breaker` | Planning | [Dev Plan](./packages/circuit-breaker) |
| `@parallax/confidence-tracker` | Planning | [Dev Plan](./packages/confidence-tracker) |
| `@parallax/pty-agent-manager` | Planning | [Dev Plan](./packages/pty-agent-manager) |
| `@parallax/org-chart-compiler` | Planning | [Dev Plan](./packages/org-chart-compiler) |
| `@parallax/git-workspace-service` | Planning | [Dev Plan](./packages/git-workspace-service) |

See [Package Extraction Roadmap](./package-extraction) for the full plan.

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
