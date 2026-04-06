# Changelog

## [0.16.2] - 2026-04-06

### Fixed
- **Codex cloud proxy now actually routes through the proxy**: 0.16.1 tried to force apikey mode via `-c auth_mode="apikey"` but `auth_mode` lives in Codex's `auth.json` file, NOT in `config.toml`, so the override did nothing. Codex would silently keep using the persisted ChatGPT subscription tokens from `~/.codex/auth.json` and bypass the proxy entirely. Now creates an isolated `CODEX_HOME` temp directory containing a fresh `auth.json` with `auth_mode: "apikey"` and a `config.toml` with `openai_base_url`. Codex reads from this temp dir instead of the user's `~/.codex/`, so requests actually route through the cloud proxy with the cloud API key.

## [0.16.1] - 2026-04-06

### Fixed
- **Codex cloud proxy routing**: Codex CLI deprecated the `OPENAI_BASE_URL` env var in favor of `openai_base_url` in `~/.codex/config.toml`. The Codex adapter now passes the proxy base URL via `-c openai_base_url="..."` CLI flag instead of the env var, eliminating the deprecation warning and ensuring requests actually route through the proxy.
- **Codex auth mode override**: When a proxy base URL is set, the adapter also passes `-c auth_mode="apikey"` so Codex bypasses any persisted ChatGPT subscription session in `~/.codex/auth.json` and uses the provided API key directly. Without this, users with a ChatGPT login would have their requests silently fall back to OpenAI's chat backend, ignoring the cloud proxy entirely.

## [0.16.0] - 2026-04-05

### Added
- **Cloud proxy base URL support**: `AgentCredentials` now accepts `anthropicBaseUrl` and `openaiBaseUrl` fields. When set, adapters inject `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, or `OPENAI_API_BASE` into the spawned agent environment, routing LLM calls through a proxy (e.g. Eliza Cloud).
  - Claude adapter: sets `ANTHROPIC_BASE_URL` env var + `CLAUDE_CODE_SIMPLE=1` to bypass subscription auth conflict
  - Codex adapter: sets `OPENAI_BASE_URL` env var
  - Aider adapter: sets `ANTHROPIC_API_KEY`, `ANTHROPIC_API_BASE`, `OPENAI_API_KEY`, `OPENAI_API_BASE` env vars for interactive mode; `--openai-api-base` CLI flag for automation mode; `--no-show-model-warnings` when proxy URLs are set
- **Auth status detection**: New `checkAuthStatus()` method on `BaseCodingAdapter` checks whether a CLI is logged in via its subscription/OAuth.
  - Claude: parses `claude auth status` JSON output
  - Codex: pattern-matches `codex login status` output
  - Gemini: checks for `~/.gemini/google_accounts.json` (cross-platform: `%APPDATA%\gemini\` on Windows)
  - Aider: returns `unknown` (no subscription auth)
  - Default base class: returns `unknown`
- **Auth trigger**: New `triggerAuth()` method on `BaseCodingAdapter` initiates CLI authentication flows. Claude runs `claude auth login` (browser OAuth), Codex runs `codex login --device-auth` (device code with ANSI stripping), Gemini returns manual instructions.
- **`AuthStatus` type**: Exported from `base-coding-adapter.ts` — `authenticated | unauthenticated | unknown` with optional `method`, `detail`, and `loginHint` fields.
- **`PreflightResult.auth`**: `checkAdapters()` now includes auth status for installed CLIs, with error handling (falls back to `unknown` on failure).
- **Claude API key acceptance rule**: Auto-response rule selects "Yes" on the "Do you want to use this API key?" prompt (Up + Enter) when `ANTHROPIC_API_KEY` is injected.
- **Aider interactive mode env vars**: API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) are now set as env vars in interactive mode (previously only passed as `--api-key` flags in automation mode).

### Fixed
- **Pattern matching order**: Negative patterns ("Not logged in") are now checked before positive patterns ("logged in") in Claude and Codex auth detection to avoid false positives.
- **`execQuiet` returns output on non-zero exit**: CLI commands like `codex login status` that exit with code 1 on "Not logged in" now return stdout/stderr instead of null.
- **Aider model selection no longer sniffs `process.env`**: Removed `process.env.GEMINI_API_KEY` / `process.env.GOOGLE_API_KEY` checks that leaked the server's env into model selection. Now uses only credentials from spawn config and the `provider` metadata field.
- **Aider false blocking prompt detection**: `detectBlockingPrompt` no longer falls back to the base class's broad "any line ending with ?" heuristic. Only detects auth/login, model selection, validation errors, and explicit y/n prompts. Normal LLM streaming output no longer triggers false positives.
- **Aider interactive mode test**: Corrected assertion — `--auto-commits` is correctly omitted in interactive mode.
- **`printMissingAdapters` tests**: Fixed tests that referenced `console.log` when the function uses pino logger.
- **Missing `@pinojs/redact` dev dependency**: Added to fix index.test.ts module load failure.

## [0.15.1] - 2026-03-31

### Added
- **Exact turn completion verbs** — detection now matches all 8 known verbs (Baked, Brewed, Churned, Cogitated, Cooked, Crunched, Sautéed, Worked) with a generic fallback for future additions.
- **Spinner verb loading detection** — 40 spinner verbs (Cogitating…, Vibing…, Clauding…, etc.) now trigger loading state, preventing false blocking prompt detection from partial spinner text.
- **Spinner frame detection** — TUI spinner characters (✢, ✳, ✶, ✻, ✽) at line start detected as loading state.
- **New auto-response rules**:
  - `"Do you want to proceed?"` — permission dialog
  - `"Do you want to make this edit to"` — file edit permission
  - `"Context limit reached"` — auto-sends `/compact` to continue execution
  - `"Press X again to exit"` — cancels accidental exit with Escape
- **New blocking prompt detections**:
  - `"Credit balance too low"` — halts with billing instructions
  - `"Context limit reached"` — detected with `/compact` suggestion
  - `"Claude Code needs your attention"` / `"needs your approval"` — generic notification prompts
  - Improved bypass permissions dialog matching with exact title text
- **New CLI flag support** via `ClaudeAdapterConfig`:
  - `bare: true` → `--bare` (lightweight automation — skips hooks, LSP, plugins, CLAUDE.md discovery)
  - `maxTurns: N` → `--max-turns N` (limit agentic turns in --print mode)
  - `maxBudgetUsd: N` → `--max-budget-usd N` (API spend limit in dollars)
  - `permissionMode: 'acceptEdits'` → `--permission-mode acceptEdits`
- **Permissive preset uses `--permission-mode acceptEdits`** — auto-accepts file edits without requiring full bypass mode.

### Fixed
- **Spinner frame false positive** — middle dot `·` separator in dialog text (e.g. "Enter · Esc") no longer triggers loading detection. Only unique spinner characters (✢, ✳, ✶, ✻, ✽) at line start are matched.
- **Vim mode guard** — `-- INSERT --` in output tail suppresses ready detection (user is typing in vim mode).

## [0.15.0] - 2026-03-30

### Added
- **37 approval-preset tests** — comprehensive test coverage for `generateApprovalConfig()` across all adapter types and preset levels.
- **Sandbox validation warning** — logged once when sandbox mode is not available for the adapter.

### Fixed
- **Auto-response disabled during busy state** — `tryAutoResponse()` no longer fires when the session status is `busy`, preventing TUI input corruption from stale status bar text matching auto-response rules.
- **`readySettleMs` tuning** — increased to 3000ms for Claude adapter; adjusted for Codex and Gemini to prevent premature task delivery.
- **Bypass permissions detection tightened** — Claude adapter now matches the modal dialog pattern specifically, not the status bar.
- **Enter key timing** — switched from blocking `execSync('sleep 1.5')` to non-blocking `setTimeout` to prevent event loop starvation during Enter key delivery.

### Changed
- **Console.log migrated to Pino** — `printMissingAdapters()` and other diagnostic output now uses structured Pino logging instead of `console.log`.
- **`--dangerously-skip-permissions` flag** — added to autonomous preset CLI flags for Claude adapter.
- Biome linter applied (formatting normalization across all source files).

## [0.14.0] - 2026-03-13

### Added
- Claude first-run theme/style auto-response rule:
  - detects the initial text style / syntax theme setup prompt
  - sends `Enter` automatically so supervised startup can continue without manual terminal input
- Aider auto-response rule for model warning docs prompt:
  - detects `Open documentation url for more info?`
  - responds with `n` to avoid blocking startup on docs navigation

### Changed
- Interactive CLI launches are now supported cleanly by the adapters when runtimes spawn the bare commands:
  - Claude interactive sessions no longer depend on automation-only startup flags
  - Codex interactive startup is recognized as ready from its composer UI/state bar
  - Aider interactive sessions avoid automation-only flags and prefer a sane Gemini model when Gemini credentials are available
- Codex ready detection now recognizes real TUI startup/composer output instead of waiting on automation-oriented prompts only.
- Claude ready detection now recognizes the post-login interactive prompt bar and home screen state more reliably.

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
