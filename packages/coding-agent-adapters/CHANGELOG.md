# Changelog

All notable changes to `coding-agent-adapters` will be documented in this file.

## [0.8.0] - 2026-02-25

### Added
- `detectToolRunning()` on `ClaudeAdapter` — detects active external tools from PTY output (matches `[word_tool]` patterns and `"Claude in <App>"` patterns)
