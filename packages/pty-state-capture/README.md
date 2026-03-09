# pty-state-capture

Raw PTY capture and interaction-state extraction for coding-agent orchestration.

This package is designed for cases like Claude Code where terminal UIs re-render with ANSI cursor movement, carriage returns, and spinner redraws.

## What it does

- Records raw PTY events as JSONL (`bytesBase64` + direction + timestamp).
- Reduces output into a VT-aware frame model (cursor position, alt-screen state, visible lines).
- Produces normalized text for resilient regex matching.
- Classifies current interaction state (`busy_streaming`, `awaiting_approval`, `awaiting_auth`, `ready_for_input`, etc.).
- Writes state and transition artifacts for offline replay and matcher tuning.
- Extracts turn-by-turn session transcripts (real-time or from recorded JSONL).
- Compares two session runs to detect regressions, stuck states, and output divergence.

Zero runtime dependencies.

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

Replay a recorded session to reconstruct final state:

```ts
import { replayRawJsonl } from 'pty-state-capture';

const snapshot = await replayRawJsonl('run.raw-events.jsonl', {
  sessionId: 'replay-1',
  outputDir: '.tmp/replay',
});

console.log(snapshot.state, snapshot.transitions);
```

Replay as an async stream of individual turns:

```ts
import { replayTurns } from 'pty-state-capture';

for await (const turn of replayTurns('run.raw-events.jsonl', {
  sessionId: 'replay-1',
  outputDir: '.tmp/replay',
})) {
  console.log(`Turn ${turn.index}: ${turn.finalState} (${turn.timing.durationMs}ms)`);
  console.log('  input:', turn.input);
  console.log('  output:', turn.cleanOutput.slice(0, 120));
}
```

## Session transcripts

Build a structured transcript from a live session or a recorded JSONL file. A transcript breaks a session into turns, where each turn starts when the state leaves idle and ends when it returns to idle.

### Real-time mode

```ts
import { SessionStateCapture, TranscriptBuilder } from 'pty-state-capture';

const capture = new SessionStateCapture({ sessionId: 's1', outputDir: './out' });
const builder = new TranscriptBuilder({ sessionId: 's1' });
builder.attachCapture(capture);

// Drive capture and turn extraction in one call
await builder.feedThrough(chunk, 'stdout');
await builder.feedThrough(userInput, 'stdin');

const transcript = builder.toTranscript();
console.log(transcript.turns.length, transcript.finalState);
```

### Offline mode

```ts
import { buildTranscriptFromJsonl } from 'pty-state-capture';

const transcript = await buildTranscriptFromJsonl('run.raw-events.jsonl', {
  sessionId: 's1',
  outputDir: '.tmp/replay',
});
```

Offline mode replays through `SessionStateCapture` with all file writes disabled.

## Session diffing and regression detection

Compare two session transcripts to detect progress or regression:

```ts
import { diffTranscripts } from 'pty-state-capture';

const result = diffTranscripts(baselineTranscript, candidateTranscript);

console.log(result.severity); // 'none' | 'info' | 'warning' | 'regression'
console.log(result.score);    // 0-100+ regression score
console.log(result.summary);
console.log(result.flags);    // e.g. ['baseline_completed_candidate_did_not', 'new_stuck_states']
```

Regression scoring factors:

| Factor | Weight | Max |
|--------|--------|-----|
| Baseline completed, candidate didn't | +40 | 40 |
| New stuck state (auth/approval) | +20/state | 40 |
| Extra turns (candidate struggling) | +3/turn | 15 |
| Output divergence (1 - Jaccard similarity) | x20 | 20 |
| Candidate completed, baseline didn't | -10 | -10 |
| Fewer turns (improvement) | -2/turn | -10 |

Severity thresholds: `none` (0), `info` (1-10), `warning` (11-30), `regression` (31+).

## API reference

### Classes

| Class | Purpose |
|-------|---------|
| `VTFrame` | Lightweight VT100 terminal frame model |
| `SessionStateCapture` | Single-session capture engine with state classification |
| `PTYStateCaptureManager` | Multi-session capture orchestration |
| `TurnExtractor` | Pure state machine for turn boundary detection |
| `TranscriptBuilder` | Real-time and offline transcript construction |

### Functions

| Function | Purpose |
|----------|---------|
| `stripAnsiPreserveText(input)` | Remove ANSI escapes, preserve text content |
| `normalizeForMatching(input)` | Strip ANSI + collapse whitespace + remove box-drawing/braille |
| `classifyState(buffer, rules, source?)` | Classify terminal state from normalized text |
| `mergeRules(userRules?)` | Merge custom rules with defaults, sorted by priority |
| `replayRawJsonl(path, options)` | Replay JSONL to reconstruct final capture state |
| `replayTurns(path, options)` | Async generator yielding turns from JSONL |
| `buildTranscriptFromJsonl(path, captureOpts, transcriptOpts?)` | Build transcript from recorded JSONL |
| `diffTranscripts(baseline, candidate)` | Compare two transcripts for regression scoring |
| `jaccardSimilarity(a, b)` | Whitespace-tokenized Jaccard similarity (0-1) |

### Key types

| Type | Description |
|------|-------------|
| `StateKind` | `'unknown' \| 'busy_streaming' \| 'awaiting_input' \| 'awaiting_auth' \| 'awaiting_approval' \| 'ready_for_input' \| 'completed'` |
| `IdleStateKind` | Subset of `StateKind` that ends a turn |
| `Turn` | Single turn with timing, input, output, transitions, final state |
| `SessionTranscript` | Complete session broken into turns |
| `SessionDiffResult` | Regression comparison result with severity, score, flags |
| `FeedOutputResult` | Result from feeding a chunk into capture |

## Notes

- Default state rules include Codex/Gemini/Claude-oriented patterns.
- Add custom rules with `stateRules` for project-specific workflows.
- Keep raw logs; they are the source of truth when normalizers evolve.
