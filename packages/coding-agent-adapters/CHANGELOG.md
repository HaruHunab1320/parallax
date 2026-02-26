# Changelog

All notable changes to `coding-agent-adapters` will be documented in this file.

## [0.8.2] - 2026-02-26

### Fixed
- `detectToolRunning()` false positive — removed loose `"Claude in <App>"` fallback pattern that matched startup status lines (e.g. `"Claude in Chrome enabled · /chrome"`) and triggered auto-interrupt; now only matches when a `[tool_name]` bracket is present

## [0.8.1] - 2026-02-25

### Added
- CHANGELOG.md

## [0.8.0] - 2026-02-25

### Added
- `detectToolRunning()` on `ClaudeAdapter` — detects active external tools from PTY output via `[word_tool]` bracket patterns
