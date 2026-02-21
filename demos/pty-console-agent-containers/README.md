# PTY Console Agent Containers Smoke Demo

This demo validates that `pty-console` can stream and control multiple live PTY sessions while each coding CLI runs in its own Docker container.

## What it does

- Starts one session per agent:
  - `claude` in `parallax/agent-claude:latest`
  - `codex` in `parallax/agent-codex:latest`
  - `gemini` in `parallax/agent-gemini:latest`
  - `aider` in `parallax/agent-aider:latest`
- Uses `PTYManager` + `coding-agent-adapters` for lifecycle and startup detection
- Uses `PTYConsoleBridge` to stream `session_output` / `session_status`
- Asserts each session reaches startup state:
  - default: `ready` OR auth/blocking prompt state
  - strict mode: `ready` only

## Run

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo test:smoke
```

Run local-CLI variant (no Docker):

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo test:smoke:local
```

Run both:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo test:smoke:all
```

## Strict ready mode

Require all sessions to reach `ready`:

```bash
PTY_CONSOLE_STRICT_READY=1 pnpm --filter @parallax/pty-console-agent-containers-demo test:smoke
```

Optional timeout override:

```bash
PTY_CONSOLE_STARTUP_TIMEOUT_MS=60000 pnpm --filter @parallax/pty-console-agent-containers-demo test:smoke
```

## Prerequisites

- Docker daemon running
- Images built locally:
  - `parallax/agent-claude:latest`
  - `parallax/agent-codex:latest`
  - `parallax/agent-gemini:latest`
  - `parallax/agent-aider:latest`

If Docker or any image is missing, the smoke test is skipped.

For local mode, install these CLIs on host:
- `claude`
- `codex`
- `gemini`
- `aider`
