# Official-Docs-Only Agent Config & Tool Matrix

Last updated: 2026-02-19
Scope: Claude Code, Gemini CLI, aider, Codex
Method: only information explicitly documented in official vendor docs/pages.

## Claude Code

Official docs:
- https://docs.claude.com/en/docs/claude-code/settings
- https://docs.claude.com/en/docs/claude-code/cli-reference

### Documented config/approval controls
- `permissions.allow`
- `permissions.ask`
- `permissions.deny`
- CLI flags: `--allowedTools`, `--disallowedTools`

### Documented tool names (examples shown in official docs)
- `Task`, `Bash`, `Glob`, `Grep`, `LS`, `Read`, `Edit`, `MultiEdit`, `Write`, `WebFetch`, `WebSearch`

### Not explicitly guaranteed by official docs
- A single canonical, version-pinned exhaustive tool registry list in one page.

## Gemini CLI

Official docs:
- https://google-gemini.github.io/gemini-cli/docs/get-started/configuration/
- https://google-gemini.github.io/gemini-cli/docs/tools/

### Documented config paths
- `~/.gemini/settings.json`
- `.gemini/settings.json`

### Documented config/approval controls
- `general.defaultApprovalMode`
- `tools.core`
- `tools.allowed`
- `tools.exclude`
- `mcp.allowed`
- `mcp.excluded`
- `security.enablePermanentToolApproval`

### Documented tools
- Built-in tools are documented on the tools page (official categories and tool entries are listed there).

### Not explicitly guaranteed by official docs
- A single separate machine-readable canonical tool registry artifact (outside docs pages) is not clearly published.

## aider

Official docs:
- https://aider.chat/docs/config/options.html
- https://aider.chat/docs/usage/commands-and-instructions.html

### Documented config/approval controls
- `--yes-always`
- `AIDER_YES_ALWAYS`
- `--config`
- Command-driven operation via slash commands (see commands docs)

### Documented command/tool surface
- Slash command surface is documented in commands/instructions docs.

### Not explicitly guaranteed by official docs
- A typed "tool registry" model equivalent to MCP-style schema lists is not the primary aider docs abstraction.

## Codex

Official docs:
- https://developers.openai.com/codex/config-reference
- https://developers.openai.com/codex/cli-reference

### Documented config/approval controls
- `approval_policy` (documented in config reference)
- Sandbox/CLI behavior documented via config + CLI references

### Documented tool surface
- Official docs describe behavior/configuration and CLI usage.

### Not explicitly guaranteed by official docs
- A single exhaustive canonical list of all internal tool schema names is not clearly presented in one official docs page.

## Cross-Agent Summary (Official-Docs-Only)

1. Claude, Gemini, and aider publicly document the main approval/config controls needed for preapproval setups.
2. Codex official docs clearly document approval/sandbox configuration, but full low-level internal tool schema enumeration is better sourced from the official codebase when exhaustive completeness is required.
3. If you need strict automation-safe matching, treat docs as policy source and repo registries as completeness source.
