# Interactive PTY Capture Usage

This demo provides interactive passthrough wrappers that let you use each CLI normally while recording PTY output/state artifacts for analysis.

## Commands

From repo root:

```bash
cd /Users/jakobgrant/Workspaces/parallax
```

Claude:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:claude:interactive
```

Gemini:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:gemini:interactive
```

Codex:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:codex:interactive
```

Aider:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:aider:interactive
```

## Common Options

All wrappers support:

```bash
--workdir /path/to/project
--output-dir .parallax/pty-captures
--cols 220
--rows 70
```

Example:

```bash
pnpm --filter @parallax/pty-console-agent-containers-demo capture:claude:interactive -- \
  --workdir /Users/jakobgrant/Workspaces/parallax \
  --output-dir .parallax/pty-captures \
  --cols 220 \
  --rows 70
```

## Exit / Detach

- Exit inside agent CLI (`/exit` where supported), or
- Press `Ctrl+]` in the wrapper terminal to detach.

## Where Captured Data Lives

Default root:

```bash
.parallax/pty-captures/
```

Each run creates a directory named like:

```text
claude-interactive-2026-02-22T17-20-00-000Z-a1b2c3d4
gemini-interactive-...
codex-interactive-...
aider-interactive-...
```

Inside each run directory, files are keyed by session id:

```text
<sessionId>.raw-events.jsonl
<sessionId>.states.jsonl
<sessionId>.transitions.jsonl
<sessionId>.lifecycle.jsonl
```

## Artifact Semantics

- `raw-events.jsonl`: raw PTY chunks, direction (`stdin`/`stdout`), base64 bytes, preview
- `states.jsonl`: classifier state samples over time
- `transitions.jsonl`: state change edges (`from -> to`)
- `lifecycle.jsonl`: session lifecycle events (`session_ready`, `session_stopped`, etc.)

## Useful Workflow

1. Start a wrapper for the target CLI.
2. Run your normal daily workflow.
3. Detach with `Ctrl+]`.
4. Review the printed artifact paths.
5. Feed `states/transitions/raw-events` into adapter prompt/state tuning.
