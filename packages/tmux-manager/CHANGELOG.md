# Changelog

## [0.1.0] - 2026-03-10

### Added
- Initial release — tmux-based session manager, drop-in alternative to `pty-manager`.
- `TmuxManager` — multi-session orchestration with events, orphan detection, and cleanup.
- `TmuxSession` — full session state machine with ready detection, stall detection, task completion, blocking prompt handling, and auto-response rules.
- `TmuxTransport` — low-level tmux CLI wrapper using `child_process.execSync` for spawn, send-keys, capture-pane, resize, signal, and session introspection.
- `ShellAdapter` — built-in adapter for bash/zsh with tmux-specific fixes (zsh `-f` flag, `PROMPT` env var, trailing whitespace handling for capture-pane).
- Crash recovery via `reconnect()` to reattach to orphaned tmux sessions.
- `listOrphanedSessions()` and `cleanupOrphanedSessions()` for managing sessions from crashed processes.
- Output streaming via capture-pane polling at 100ms intervals.
- Exit detection via `remain-on-exit` + `#{pane_dead}` polling.
- `TMUX_KEY_MAP` for translating key names to tmux key names.
- `ensureTmux()` preflight check with version detection and caching.
- Shared adapter types from `adapter-types` package.
