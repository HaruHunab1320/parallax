# Changelog

All notable changes to `parallax-agent-runtime` will be documented in this file.

## [0.8.6] - 2026-03-09

### Added
- **`ensurePty()` re-exported from `pty-manager`** — lazy preflight check called once before the first PTY spawn (instead of a `postinstall` script, which is an npm supply-chain attack vector). The check now lives in `pty-manager` and runs automatically in `PTYSession.start()`, so all consumers get it. Re-exported for direct usage.

### Removed
- **`postinstall` script** — replaced by `pty-manager`'s built-in `ensurePty()` runtime preflight
- **`scripts/` directory** — no longer published

### Changed
- Bumped `pty-manager` dependency from `^1.9.6` to `^1.9.8`

## [0.8.5] - 2026-03-08

### Added
- **Hermes agent support** — registered `HermesAdapter` from `coding-agent-adapters`. Hermes is now a first-class agent type (`'hermes'`) across all MCP tools, health checks, approval presets, and workspace file operations.
- **`task_complete` event forwarding** — MCP clients are now notified when an agent finishes its task, enabling orchestrators to react without polling.
- **`tool_running` event forwarding** — MCP clients are notified when an agent's adapter detects an active external tool (browser, bash, etc.), useful for UI status indicators and stall prevention.
- **`notify_hook_event` tool** — new MCP tool to forward external hook events (`tool_running`, `task_complete`, `permission_approved`) into an agent's PTY session state machine. Bridges Claude Code HTTP hooks and Gemini hook telemetry into the runtime.
- **`write_raw` tool** — new MCP tool to write raw data (escape sequences, control characters) directly to an agent's terminal.
- **`get_hook_config` tool** — new MCP tool to retrieve hook telemetry protocol configuration for any agent type. Returns the hook script, marker prefix, settings, and HTTP endpoint config needed for deterministic state detection via hooks.
- **Git worktree tools** — three new MCP tools for parallel workspace management:
  - `add_worktree` — add a git worktree to an existing clone workspace (shares `.git` directory for faster parallel work)
  - `list_worktrees` — list all worktrees for a parent workspace
  - `remove_worktree` — remove a git worktree
- **`inheritProcessEnv` spawn option** — when set to `false`, only adapter and config environment variables are passed to the spawned agent process, preventing credential leakage from the host environment.
- **`skipAdapterAutoResponse` spawn option** — emit blocking prompts without auto-responding, allowing the orchestrator to handle all prompts manually.
- **`readySettleMs` spawn option** — override the ready-settle delay per agent, controlling how long to wait after the prompt appears before accepting input.
- **`traceTaskCompletion` spawn option** — enable verbose trace logging for task-completion detection, useful for debugging adapter patterns.
- **`ToolRunningInfo` type** — exported type describing an active tool inside an agent session.
- **`HookEventType` type** — exported union type for hook event names.
- **`cli_auth` auth method** — added to `AuthRequiredInfo.method` for CLI-native authentication flows (e.g. Claude Code login-required).

### Changed
- Bumped `pty-manager` dependency from `^1.6.6` to `^1.9.6`
- Bumped `coding-agent-adapters` dependency from `^0.7.2` to `^0.12.0`
- Bumped `git-workspace-service` dependency from `^0.4.0` to `^0.4.4`
- `AgentType` now includes `'hermes'` in addition to `'claude'`, `'codex'`, `'gemini'`, `'aider'`, and `'custom'`
- Health check now includes Hermes adapter in preflight checks
- MCP tool count increased from 15 to 21

## [0.8.4] - 2026-03-02

### Added
- Approval presets system — `list_presets` and `get_preset_config` tools
- `approvalPreset` option on spawn — writes CLI-specific approval config files to workspace
- `interactive` mode flag on spawn — controls non-interactive CLI flags

## [0.8.3] - 2026-02-28

### Added
- `ruleOverrides` on spawn — per-agent auto-response rule customization
- `stallTimeoutMs` on spawn — per-agent stall timeout override
- Stall detection event forwarding

## [0.8.0] - 2026-02-25

### Added
- Initial release with MCP server, agent lifecycle management, workspace provisioning
- Support for Claude, Codex, Gemini, and Aider agents
- JWT and API key authentication
- Terminal attachment and log streaming
