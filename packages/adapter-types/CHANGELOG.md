# Changelog

## [0.1.0] - 2026-03-10

### Added
- Initial release — shared adapter interface, base class, registry, and types extracted from `pty-manager`.
- `CLIAdapter` interface defining the contract for CLI tool adapters.
- `BaseCLIAdapter` abstract class with default implementations for exit detection, blocking prompt detection, task completion, input formatting, installation validation, and ANSI stripping.
- `AdapterRegistry` class for managing registered adapters.
- `createAdapter()` factory function for creating adapters from configuration objects.
- Shared types: `SpawnConfig`, `ParsedOutput`, `LoginDetection`, `BlockingPromptType`, `BlockingPromptDetection`, `AutoResponseRule`, `ToolRunningInfo`, `AdapterFactoryConfig`, `MessageType`.
