# Changelog

## 0.2.0

### Added

- **Turn extraction** (`TurnExtractor`): Pure state machine that detects turn boundaries from `FeedOutputResult` events. A turn starts when state leaves idle and ends when it returns to any idle state (`ready_for_input`, `awaiting_input`, `awaiting_approval`, `awaiting_auth`, `completed`). Bootstrap phase captured as turn 0.
- **Session transcripts** (`TranscriptBuilder`, `buildTranscriptFromJsonl`): Build structured `SessionTranscript` objects from live sessions (real-time mode via `attachCapture`/`feedThrough`) or from recorded JSONL files (offline mode with all file writes disabled).
- **Session diffing** (`diffTranscripts`): Compare two `SessionTranscript`s to detect regressions. Produces a weighted score (0-100+) based on completion status, stuck states, extra turns, and output divergence. Severity levels: `none`, `info`, `warning`, `regression`.
- **Turn replay** (`replayTurns`): Async generator that yields individual `Turn` objects from a raw-events JSONL file.
- **Jaccard similarity** (`jaccardSimilarity`): Whitespace-tokenized set similarity for comparing turn output.
- New types: `IdleStateKind`, `TurnTiming`, `Turn`, `SessionTranscript`, `TranscriptBuilderOptions`, `TurnComparison`, `RegressionSeverity`, `SessionDiffResult`.

## 0.1.0

Initial release.

- Raw PTY event recording as JSONL.
- VT100 terminal frame model (`VTFrame`).
- ANSI stripping and text normalization.
- State classification with configurable rules (Codex, Gemini, Claude patterns).
- Gemini-specific hysteresis and debounce for flicker reduction.
- Multi-session capture manager (`PTYStateCaptureManager`).
- Offline replay from JSONL (`replayRawJsonl`).
