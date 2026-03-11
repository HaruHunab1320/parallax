# Changelog

All notable changes to `pty-manager` will be documented in this file.

## [1.10.0] - 2026-03-10

### Changed
- **Adapter types extracted to `adapter-types` package** — `CLIAdapter`, `BaseCLIAdapter`, `AdapterRegistry`, `createAdapter`, and all adapter-related types (`SpawnConfig`, `ParsedOutput`, `LoginDetection`, `BlockingPromptDetection`, `AutoResponseRule`, `ToolRunningInfo`, `AdapterFactoryConfig`) are now sourced from the shared `adapter-types` package. All exports are re-exported from `pty-manager` for full backwards compatibility — no consumer changes required.

## [1.9.8] - 2026-03-09

### Added
- **`ensurePty()` runtime preflight** — lazy check called once before the first PTY spawn in `PTYSession.start()`. Finds prebuilt `pty.node` under `prebuilds/<platform>-<arch>/` (node-pty >=1.0), falls back to `build/Release/pty.node` from node-gyp. Fixes spawn-helper permissions that `bun install` can strip (causing `posix_spawnp failed` at runtime). Rebuilds via `node-gyp rebuild` with a 2-minute timeout as a last resort. Idempotent — subsequent calls are no-ops. Exported for direct usage by consumers.

## [1.9.7] - 2026-03-09

### Fixed
- **Blocking prompt flood after permission approval** — `notifyHookEvent('permission_approved')` no longer clears `_lastBlockingPromptHash`. The hash is preserved so TUI re-renders of the same prompt are deduped, preventing a wall of duplicate `blocking_prompt` events. The output buffer is still cleared to avoid stale text re-triggering detection.
- **Adapter auto-response re-detection loop** — after an adapter auto-responds to a blocking prompt, the hash is now preserved (previously cleared) so the same prompt re-rendered by the TUI doesn't fire again.

## [1.9.6] - 2026-03-07

### Added
- **Hook event notification** — new `notifyHookEvent(event)` method on `PTYSession` bridges external hook events (e.g. Claude Code HTTP hooks) into the session state machine. Supports `tool_running` (resets stall timer), `task_complete` (transitions to ready), and `permission_approved` (clears blocking prompt hash).
- **`notifyHookEvent` IPC command** — added to pty-worker and `BunCompatiblePTYManager` so hook events can be forwarded from the orchestrator through the Bun↔Node IPC bridge.

### Fixed
- **Blocking prompt deduplication with TUI re-renders** — prompt hash now normalizes whitespace, numbers, and length before comparison, preventing re-emission of the same blocking prompt when TUI cursor repositioning causes minor text differences.

## [1.9.5] - 2026-03-02

### Fixed
- **Worker `handleKill` ignores signal parameter** — `handleKill()` now accepts and forwards the `signal` field from the JSON-RPC kill command. When `signal` is `"SIGKILL"`, passes `{ force: true }` to `manager.stop()` so completed sessions are immediately killed instead of waiting for graceful SIGTERM shutdown. Prevents orphaned child processes when the orchestrator calls `stopSession(id, force=true)`.

## [1.9.4] - 2026-03-01

### Fixed
- **Blocking prompt re-detection loop** — `sendKeys()` now clears `outputBuffer` and `_lastBlockingPromptHash` before writing, matching the behavior of `send()` and internal auto-response. Prevents the coordinator from re-detecting the same blocking prompt after sending a key response.
- **Blocking prompt spam after session stop** — `processOutputBuffer()` now skips blocking prompt detection when session status is `stopping` or `stopped`, preventing a flood of `blocking_prompt` events between `stopSession()` and PTY process exit

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
