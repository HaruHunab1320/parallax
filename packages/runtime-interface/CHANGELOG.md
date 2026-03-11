# Changelog

## [0.1.0] - 2026-03-11

### Added
- Initial release of shared runtime interfaces for Parallax agent runtimes.
- Core types: `AgentType`, `AgentStatus`, `MessageType`, `AgentConfig`, `AgentCredentials`, `AgentHandle`, `AgentMessage`, `RuntimeEvent`, `BlockingPromptInfo`, `AgentRequirement`, `AgentMetrics`, `AgentLogEntry`.
- `RuntimeProvider` and `RuntimeProviderWithEvents` interfaces for runtime implementations.
- `BaseRuntimeProvider` abstract class with default event handling.
- `CLIAdapter` interface and `AdapterRegistry` for managing CLI tool adapters.
- Adapter types: `ParsedOutput`, `LoginDetection`, `BlockingPromptType`, `BlockingPromptDetection`, `AutoResponseRule`.
