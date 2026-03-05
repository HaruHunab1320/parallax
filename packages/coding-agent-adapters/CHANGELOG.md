# Changelog

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
