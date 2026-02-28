# Changelog

All notable changes to `pty-manager` will be documented in this file.

## [1.9.2] - 2026-02-28

### Changed
- Added `cli_auth` to `LoginDetection.type` for CLI-native authentication prompts (for example Claude Code login-required flows).
- Added `cli_auth` to `AuthRequiredMethod`.
- Updated `PTYSession` auth mapping so `LoginDetection.type === "cli_auth"` emits `auth_required.method = "cli_auth"`.

## [1.9.1] - 2026-02-25

### Added
- `inheritProcessEnv` flag on `SpawnConfig` — when set to `false`, `process.env` is not spread into the spawned process environment, preventing credential leakage to child agents
- `PTYSession.buildSpawnEnv()` static method for testable env construction

## [1.9.0] - 2026-02-25

### Added
- `tool_running` event on `PTYSession` and `PTYManager` — emitted when the adapter detects an external tool is active (e.g. browser automation, bash, Node processes)
- `detectToolRunning()` optional method on `CLIAdapter` interface
- `ToolRunningInfo` type export (`toolName`, `description?`)
- Tool-running detection suppresses stall timer to avoid false positives
- `tool_running` forwarding through pty-worker IPC and `BunCompatiblePTYManager`

## [1.8.0] - 2026-02-25

### Fixed
- **BunCompatiblePTYManager adapter registration race** — `waitForReady()` now defers until `registerAdapters` ack is received, preventing use-before-ready bugs
- **Special key format mismatch** — added `PTYSession.normalizeKeyList()` to remap modifier aliases (`"control"` → `"ctrl"`, `"command"` → `"meta"`, `"option"` → `"alt"`) and join bare modifier + key (`["control", "c"]` → `["ctrl+c"]`)
- **Shell `detectReady()` false positives** — rewrote to use `getPromptPattern()` regex with `stripAnsi()`; bare `>` no longer matches as a prompt
- **Missing continuation prompt detection** — added `isContinuationPrompt()` for `quote>`, `dquote>`, `heredoc>`, `bquote>`, `cmdsubst>`, `pipe>`, `then>`, `else>`, `do>`, `loop>`

## [1.7.3] - 2026-02-25

### Added
- `writeRaw` command in pty-worker IPC protocol
- `writeRaw(id, data)` async method on `BunCompatiblePTYManager`
