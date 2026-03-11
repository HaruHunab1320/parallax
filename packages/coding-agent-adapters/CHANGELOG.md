# Changelog

## [0.13.0] - 2026-03-10

### Changed
- **Adapter types sourced from `adapter-types` package** — `BaseCLIAdapter`, `SpawnConfig`, `ParsedOutput`, `LoginDetection`, `BlockingPromptDetection`, `AutoResponseRule`, `ToolRunningInfo` are now imported from the shared `adapter-types` package instead of `pty-manager`. This decouples coding agent adapters from the PTY backend, allowing them to work with both `pty-manager` and `tmux-manager`.
- `pty-manager` is no longer a peer dependency (moved to dev-only for tests).

## [0.12.0] - 2026-03-05

### Added
- HTTP hook mode for `ClaudeAdapter.getHookTelemetryProtocol()`:
  - When `httpUrl` is provided, generates HTTP hook entries (`type: "http"`) instead of command-based hooks.
  - Supports `sessionId` option to inject `X-Parallax-Session-Id` header for session correlation.
  - Covers `PermissionRequest`, `PreToolUse`, `Stop`, `Notification`, and `TaskCompleted` events.
- `BaseCodingAdapter.getHookTelemetryProtocol()` base method (returns `null` by default) so all adapters share the interface.

### Changed
- `ClaudeAdapter.getHookTelemetryProtocol()` now accepts `httpUrl` and `sessionId` options alongside the existing `scriptPath`/`markerPrefix` options.
- Command-based hook generation preserved as fallback when `httpUrl` is not provided.

## [0.11.1] - 2026-03-05

### Fixed
- Claude permission prompt auto-response rule now has `once: true`, preventing an infinite Enter-spam loop when TUI re-renders trigger repeated rule matches.

## [0.11.0] - 2026-03-05

### Added
- Gemini hook telemetry integration (optional) in `GeminiAdapter`:
  - Marker protocol support for `PARALLAX_GEMINI_HOOK {json}` lines.
  - Deterministic state detection from Gemini hook events:
    - `Notification` (`ToolPermission`)
    - `BeforeTool` (tool-running/loading)
    - `AfterAgent` (turn completion + ready)
    - `SessionEnd` (exit detection)
- `GeminiAdapter.getHookTelemetryProtocol()` helper to generate a minimal hook script + settings hook map for `.gemini/settings.json`.

### Changed
- `GeminiAdapter.parseOutput()` now strips hook marker lines from final parsed content.
- `CodingAgentConfig.adapterConfig` now documents Gemini hook telemetry flags:
  - `geminiHookTelemetry`
  - `geminiHookMarkerPrefix`
- README now documents Gemini hooks telemetry mode and setup flow.

## [0.10.0] - 2026-03-05

### Added
- Claude hook telemetry integration (optional) in `ClaudeAdapter`:
  - Marker protocol support for `PARALLAX_CLAUDE_HOOK {json}` lines.
  - Deterministic state detection from Claude hook events:
    - `Notification` (`permission_prompt`, `elicitation_dialog`, `idle_prompt`)
    - `PreToolUse` (tool-running/loading)
    - `TaskCompleted` (turn completion)
    - `SessionEnd` (exit detection)
- `ClaudeAdapter.getHookTelemetryProtocol()` helper to generate a minimal hook script + settings hook map for `.claude/settings.json`.

### Changed
- `ClaudeAdapter.parseOutput()` now strips hook marker lines from final parsed content.
- `CodingAgentConfig.adapterConfig` now documents Claude hook telemetry flags:
  - `claudeHookTelemetry`
  - `claudeHookMarkerPrefix`
- README now documents Claude hooks telemetry mode, marker protocol, and setup flow.

## [0.9.0] - 2026-03-05

### Added
- New `HermesAdapter` for Hermes Agent CLI integration:
  - startup/auth detection for Hermes setup gate prompts
  - blocking prompt detection for clarify, sudo password, and dangerous-command approval flows
  - loading/working detection for Hermes thinking/tool spinner output
  - ready/task-complete detection for Hermes prompt and response box output
- `hermes` added to adapter exports and factory helpers:
  - `createAdapter('hermes')`
  - `createAllAdapters()` now includes Hermes
  - `ADAPTER_TYPES.hermes`
- Baseline dynamic pattern-loader support for Hermes (`ready`, `auth`, `blocking`, `loading`, `turnComplete`, `toolWait`, `exit`).
- Hermes approval preset translation (`generateHermesApprovalConfig`) and support in `generateApprovalConfig()` dispatch.
- New Hermes-specific test suite and expanded index/preset/task-complete coverage.

### Changed
- `AdapterType` now includes `hermes`.
- README and package metadata now document Hermes alongside Claude/Gemini/Codex/Aider (tables, examples, lifecycle, `ADAPTER_TYPES`, keywords/description).

All notable changes to `coding-agent-adapters` will be documented in this file.

## [0.8.9] - 2026-03-02

### Fixed
- Re-publish with built dist artifacts (0.8.8 was published without build)

## [0.8.8] - 2026-03-02

### Added
- Auto-response rule for Claude Code tool permission prompts (MCP tools, file access, etc.). Previously these were detected as blocking prompts but had no matching auto-response rule, causing 4-8 second stall-detector delays per permission. Now instantly auto-approved with Enter key.

## [0.8.7] - 2026-03-01

### Fixed
- **False blocking prompt detection on Claude idle output** — `detectBlockingPrompt()` now returns `detected: false` when the output contains `❯` (idle prompt) or matches `detectTaskComplete()`. Prevents the base-class "last line ends with ?" fallback from misclassifying partial TUI chunks (e.g. `?` arriving before `for shortcuts`) as blocking prompts, which caused an enter-key loop that destroyed the task completion evidence in the output buffer.

## [0.8.6] - 2026-02-28

### Fixed
- Rebuilt and refreshed published artifacts (`dist/*`) before release so package output includes the Claude CLI auth detection fix from source.

## [0.8.5] - 2026-02-28

### Fixed
- `ClaudeAdapter.detectLogin()` now detects Claude Code CLI auth prompts when the user is not logged in:
  - `Not logged in`
  - `Please run /login`
  - `please log in`
  - `run /login`
- This now returns a `cli_auth` login requirement with instructions to run `claude login`, and the check is evaluated before API key patterns so it takes priority.

## [0.8.4] - 2026-02-26

### Fixed
- Published build now matches source for Claude tool-running detection:
  - removed legacy `"Claude in <App>"` fallback from distributed `dist` output
  - startup/status lines such as `Claude in Chrome enabled · /chrome` no longer emit `tool_running`
  - explicit tool markers like `[bash_tool]` and `Claude in Chrome[javascript_tool]` still emit correctly

## [0.8.3] - 2026-02-26

### Fixed
- `ClaudeAdapter.detectBlockingPrompt()` no longer classifies startup status-bar lines as blocking menu navigation (for example: `? for shortcuts`, `Claude in Chrome enabled · /chrome`, `Update available! ...`)
- `ClaudeAdapter.detectToolRunning()` no longer binds `Claude in Chrome enabled` status context to unrelated bracketed tool tokens in the same tail buffer
- `checkAllAdapters()`/`checkAdapters()` timeout failures in tests by removing real CLI preflight execution from unit tests and mocking adapter installation checks

### Changed
- `checkAdapters()` now validates adapters in parallel via `Promise.all(...)` to reduce preflight latency

## [0.8.2] - 2026-02-26

### Fixed
- `detectToolRunning()` false positive — removed loose `"Claude in <App>"` fallback pattern that matched startup status lines (e.g. `"Claude in Chrome enabled · /chrome"`) and triggered auto-interrupt; now only matches when a `[tool_name]` bracket is present

## [0.8.1] - 2026-02-25

### Added
- CHANGELOG.md

## [0.8.0] - 2026-02-25

### Added
- `detectToolRunning()` on `ClaudeAdapter` — detects active external tools from PTY output via `[word_tool]` bracket patterns
