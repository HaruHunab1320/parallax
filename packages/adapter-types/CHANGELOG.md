# Changelog

## [0.2.0] - 2026-03-30

### Added
- **`sanitizeOutput()` utility** — shared output sanitizer for stripping ANSI escape codes, TUI box-drawing characters, OSC/DCS sequences, and collapsing blank lines. Configurable via `SanitizeOptions` (stripAnsi, stripTuiChrome, stripOsc, collapseBlankLines, maxLength). Used by pty-manager, tmux-manager, and the workflow executor for clean text processing.
- **31 unit tests** for OutputSanitizer covering ANSI stripping, TUI chrome removal, OSC sequences, blank line collapsing, maxLength truncation, and option combinations.

### Fixed
- **`formatInput()` ANSI stripping** — `BaseCLIAdapter.formatInput()` now strips ANSI escape codes from input text while preserving newlines. Newline collapsing moved to tmux-session (transport-specific limitation).
- **`session_ready` race condition** — fixed timing issue where session_ready events could be missed during rapid state transitions.

### Changed
- Biome linter applied (formatting normalization across all source files).

## [0.1.0] - 2026-03-10

### Added
- Initial release — shared adapter interface, base class, registry, and types extracted from `pty-manager`.
- `CLIAdapter` interface defining the contract for CLI tool adapters.
- `BaseCLIAdapter` abstract class with default implementations for exit detection, blocking prompt detection, task completion, input formatting, installation validation, and ANSI stripping.
- `AdapterRegistry` class for managing registered adapters.
- `createAdapter()` factory function for creating adapters from configuration objects.
- Shared types: `SpawnConfig`, `ParsedOutput`, `LoginDetection`, `BlockingPromptType`, `BlockingPromptDetection`, `AutoResponseRule`, `ToolRunningInfo`, `AdapterFactoryConfig`, `MessageType`.
