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

## Claude State Capture (Internal Tracing)

Run Claude with `pty-manager-internal-tracing` capture enabled and print live interaction-state transitions:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:claude
```

With a prompt:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:claude -- --prompt "Create a short TODO list"
```

Useful options:

- `--timeout-ms 180000`
- `--output-dir .parallax/pty-captures`
- `--workdir /path/to/repo`

The script prints artifact file paths (`raw-events`, `states`, `transitions`, `lifecycle`) at the end of the run.

Interactive passthrough capture (use Claude normally while recording all terminal I/O and state transitions):

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:claude:interactive
```

Exit/detach options:

- Type `/exit` in Claude, or
- Press `Ctrl+]` in the wrapper terminal

Interactive wrapper options:

- `--workdir /path/to/repo`
- `--output-dir .parallax/pty-captures`
- `--cols 220`
- `--rows 70`

Gemini interactive passthrough capture:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:gemini:interactive
```

Codex interactive passthrough capture:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:codex:interactive
```

Both support:

- `--workdir /path/to/repo`
- `--output-dir .parallax/pty-captures`
- `--cols 220`
- `--rows 70`
- Detach with `Ctrl+]`

Aider interactive passthrough capture:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:aider:interactive
```

Full guide (all agent wrappers, artifact structure, and workflow):

- `demos/pty-console-agent-containers/CAPTURE_USAGE.md`

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
