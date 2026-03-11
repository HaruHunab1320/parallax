# Changelog

## [0.1.0] - 2026-03-11

### Added
- Initial release of the Parallax Pattern SDK.
- `PatternGenerator` for generating orchestration patterns from requirements.
- `PatternValidator` for validating pattern syntax and semantics.
- `PatternTester` for testing pattern behavior.
- `PrimitiveLoader` for loading and managing primitive definitions.
- `GeminiProvider` LLM integration for pattern generation.
- YAML-to-Prism compiler (`compileYamlToPrism`, `compileYamlFile`).
- CLI tool (`parallax-generate`) with pattern, template, validate, and compile commands.
- Pattern templates for common orchestration scenarios.
- Configuration loader with `PatternConfig` type.
- Zod-based schema validation for orchestration requirements.
