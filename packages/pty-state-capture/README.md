# pty-state-capture

Raw PTY capture and interaction-state extraction for coding-agent orchestration.

This package is designed for cases like Claude Code where terminal UIs re-render with ANSI cursor movement, carriage returns, and spinner redraws.

## What it does

- Records raw PTY events as JSONL (`bytesBase64` + direction + timestamp).
- Reduces output into a VT-aware frame model (cursor position, alt-screen state, visible lines).
- Produces normalized text for resilient regex matching.
- Classifies current interaction state (`busy_streaming`, `awaiting_approval`, `awaiting_auth`, `ready_for_input`, etc.).
- Writes state and transition artifacts for offline replay and matcher tuning.

## Artifact files

Per session, written under `<outputRoot>/<sessionId>/`:

- `<sessionId>.raw-events.jsonl`
- `<sessionId>.states.jsonl`
- `<sessionId>.transitions.jsonl`
- `<sessionId>.lifecycle.jsonl`

## Quick start

```ts
import { PTYStateCaptureManager } from 'pty-state-capture';

const capture = new PTYStateCaptureManager({
  outputRootDir: '.parallax/pty-captures',
  defaultRows: 80,
  defaultCols: 220,
});

await capture.lifecycle(sessionId, 'session_started');
await capture.feed(sessionId, rawChunkFromPty, 'stdout');
await capture.feed(sessionId, userInputText, 'stdin');

const snap = capture.snapshot(sessionId);
console.log(snap?.state.state, snap?.state.ruleId);
```

## Recommended integration with `pty-manager`

Hook capture calls where raw PTY data is already available:

- On PTY output callback: `capture.feed(sessionId, data, 'stdout')`
- On user text/keys write: `capture.feed(sessionId, input, 'stdin')`
- On lifecycle events: `capture.lifecycle(sessionId, ...)`

This keeps capture passive and avoids changing adapter logic.

## Replay

```ts
import { replayRawJsonl } from 'pty-state-capture';

const replay = await replayRawJsonl('run.raw-events.jsonl', {
  sessionId: 'replay-1',
  outputDir: '.tmp/replay',
});

console.log(replay.state, replay.transitions);
```

## Notes

- Default state rules include Codex/Gemini/Claude-oriented patterns.
- Add custom rules with `stateRules` for project-specific workflows.
- Keep raw logs; they are the source of truth when normalizers evolve.
