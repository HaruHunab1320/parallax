# Changelog

All notable changes to `coding-agent-adapters` will be documented in this file.

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
