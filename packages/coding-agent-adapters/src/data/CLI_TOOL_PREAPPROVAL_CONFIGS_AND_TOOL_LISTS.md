# CLI Tool Preapproval Configs and Tool Lists

Last updated: 2026-02-19

Scope: Claude Code, aider, Gemini CLI, Codex only.  
Goal: identify config paths, preapproval controls, CLI invocation options, and tool inventories.

## Claude Code (`/Workspaces/claude-code`)

Important caveat: this open repo is docs/plugins/examples heavy, not the full runtime source. This section is source-backed but not guaranteed exhaustive for internal runtime-only tool registries.

### Config paths

- `.claude/settings.json` (project settings), see `claude-code/README.md:50`.
- Also referenced in examples/docs: `managed-settings.json`, `settings.json`, `settings.local.json`, see `claude-code/examples/settings/README.md:26`.

### Preapproval controls

- `permissions.ask`, `permissions.deny`, see `claude-code/examples/settings/settings-strict.json:4`, `claude-code/examples/settings/settings-strict.json:7`.
- `permissions.disableBypassPermissionsMode`, see `claude-code/examples/settings/settings-lax.json:3`.
- `allowManagedPermissionRulesOnly`, `allowManagedHooksOnly`, see `claude-code/examples/settings/settings-strict.json:12`, `claude-code/examples/settings/settings-strict.json:13`.
- Sandbox policy knobs for Bash: `sandbox.enabled`, `sandbox.autoAllowBashIfSandboxed`, `sandbox.allowUnsandboxedCommands`, see `claude-code/examples/settings/settings-bash-sandbox.json:4`, `claude-code/examples/settings/settings-bash-sandbox.json:5`, `claude-code/examples/settings/settings-bash-sandbox.json:6`.
- CLI flags (changelog evidence): `--tools`, `--disallowedTools`, see `claude-code/CHANGELOG.md:543`, `claude-code/CHANGELOG.md:537`.

### Tools list (explicitly evidenced in this repo)

- `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `TodoWrite`, `Task`, `AskUserQuestion`, `Skill`, `NotebookRead`, `LS`, `KillShell`, `BashOutput`
- Evidence: `claude-code/examples/settings/settings-strict.json:5`, `claude-code/examples/settings/settings-strict.json:8`, `claude-code/examples/settings/README.md:27`, `claude-code/plugins/feature-dev/agents/code-architect.md:4`, `claude-code/plugins/hookify/commands/hookify.md:4`.
- MCP naming patterns: `mcp__...` and wildcard patterns, see `claude-code/CHANGELOG.md:535`, `claude-code/plugins/plugin-dev/skills/mcp-integration/SKILL.md:218`.

## aider (`/Workspaces/aider`)

Note: aider is command/confirmation-driven rather than a typed tool registry model.

### Config paths

- Main config: `.aider.conf.yml` (search order CWD -> git root -> home), see `aider/aider/main.py:464`, `aider/aider/main.py:468`, `aider/aider/main.py:473`, `aider/aider/main.py:476`.
- Explicit config override flag: `--config`, see `aider/aider/args.py:789`.
- Model config files: `.aider.model.settings.yml`, `.aider.model.metadata.json`, see `aider/aider/args.py:123`, `aider/aider/args.py:129`.
- History files: `.aider.input.history`, `.aider.chat.history.md`, see `aider/aider/args.py:272`, `aider/aider/args.py:275`.

### Preapproval controls

- `--yes-always`, see `aider/aider/args.py:760`.
- YAML key `yes-always`, see `aider/aider/website/docs/config/aider_conf.md:455`.
- Env var namespace `AIDER_*`, see `aider/aider/args.py:41`.
- Confirmation options include yes/no/skip/all and optional “don’t ask again”, see `aider/aider/io.py:831`, `aider/aider/io.py:838`, `aider/aider/io.py:913`.

Nuance:
- Some flows require explicit yes and can bypass blanket auto-yes behavior, see `aider/aider/io.py:812`, `aider/aider/io.py:908`.

### Command inventory (aider’s practical tool surface)

User-facing slash command surface comes from `cmd_*` methods, see `aider/aider/commands.py:276`.

Current command set includes:
`/model`, `/editor-model`, `/weak-model`, `/chat-mode`, `/models`, `/web`, `/commit`, `/lint`, `/clear`, `/reset`, `/tokens`, `/undo`, `/diff`, `/add`, `/drop`, `/git`, `/test`, `/run`, `/exit`, `/quit`, `/ls`, `/help`, `/ask`, `/code`, `/architect`, `/context`, `/voice`, `/paste`, `/read-only`, `/map`, `/map-refresh`, `/settings`, `/load`, `/save`, `/multiline-mode`, `/copy`, `/report`, `/editor`, `/edit`, `/think-tokens`, `/reasoning-effort`, `/copy-context`.

Evidence anchor: method definitions starting at `aider/aider/commands.py:87`.

## Gemini CLI (`/Workspaces/gemini-cli`)

### Config paths

- User settings: `~/.gemini/settings.json`, see `gemini-cli/docs/get-started/configuration.md:43`.
- Project settings: `.gemini/settings.json`, see `gemini-cli/docs/get-started/configuration.md:47`.
- System defaults/settings files per OS: `gemini-cli/docs/get-started/configuration.md:33`, `gemini-cli/docs/get-started/configuration.md:50`.
- Trust file: `~/.gemini/trustedFolders.json`, see `gemini-cli/docs/cli/trusted-folders.md:38`, `gemini-cli/packages/cli/src/config/trustedFolders.ts:27`, `gemini-cli/packages/cli/src/config/trustedFolders.ts:33`.

### Preapproval controls

- `general.defaultApprovalMode`: `default|auto_edit|plan`, see `gemini-cli/docs/get-started/configuration.md:105`.
- CLI flags: `--approval-mode`, `--yolo/-y`, see `gemini-cli/packages/cli/src/config/config.ts:148`, `gemini-cli/packages/cli/src/config/config.ts:155`.
- Tool filtering/auto-allow:
  - `tools.core` (allowlist), see `gemini-cli/docs/get-started/configuration.md:730`.
  - `tools.allowed` (bypass confirmation), see `gemini-cli/docs/get-started/configuration.md:737`.
  - `tools.exclude`, see `gemini-cli/docs/get-started/configuration.md:745`.
- MCP filtering:
  - `mcp.allowed`, `mcp.excluded`, see `gemini-cli/docs/get-started/configuration.md:787`, `gemini-cli/docs/get-started/configuration.md:792`.
- Persistent approval option gate:
  - `security.enablePermanentToolApproval`, see `gemini-cli/docs/get-started/configuration.md:810`.
- Trust interaction:
  - untrusted folders force approval mode back to default, see `gemini-cli/packages/cli/src/config/config.ts:600`.

### Built-in tool inventory (documented)

- `read_many_files`, `run_shell_command`
- `list_directory`, `read_file`, `write_file`, `glob`, `search_file_content`, `replace`
- `ask_user`, `save_memory`, `write_todos`, `activate_skill`, `get_internal_docs`
- `web_fetch`, `google_web_search`

Evidence: `gemini-cli/docs/tools/index.md:12`, `gemini-cli/docs/tools/index.md:16`, `gemini-cli/docs/tools/index.md:29`, `gemini-cli/docs/tools/index.md:65`.

## Codex (`/Workspaces/codex`)

### Config paths

- Main config: `~/.codex/config.toml`, see `codex/codex-rs/core/src/config/mod.rs:884`.
- Key top-level config fields:
  - `approval_policy`, `sandbox_mode`, `web_search`, `mcp_servers`, `projects`, see `codex/codex-rs/core/src/config/mod.rs:903`, `codex/codex-rs/core/src/config/mod.rs:909`, `codex/codex-rs/core/src/config/mod.rs:1041`, `codex/codex-rs/core/src/config/mod.rs:958`, `codex/codex-rs/core/src/config/mod.rs:1038`.
- Tool toggles:
  - `[tools] web_search`, `view_image`, see `codex/codex-rs/core/src/config/mod.rs:1163`, `codex/codex-rs/core/src/config/mod.rs:1165`, `codex/codex-rs/core/src/config/mod.rs:1169`.
- Per-project trust:
  - `[projects."<path>"] trust_level = "trusted"|"untrusted"`, see `codex/codex-rs/core/src/config/mod.rs:1147`, `codex/codex-rs/core/src/config/mod.rs:831`.

### CLI invocation controls (override config)

- `--ask-for-approval/-a`, `--sandbox/-s`, `--search`, `--full-auto`, `--dangerously-bypass-approvals-and-sandbox`, see `codex/codex-rs/tui/src/cli.rs:72`, `codex/codex-rs/tui/src/cli.rs:76`, `codex/codex-rs/tui/src/cli.rs:80`, `codex/codex-rs/tui/src/cli.rs:86`, `codex/codex-rs/tui/src/cli.rs:98`.

### Preapproval controls

- `approval_policy` enum family maps to runtime behavior via CLI/config (`untrusted|on-failure|on-request|never`), see `codex/codex-rs/utils/cli/src/approval_mode_cli_arg.rs:13`, `codex/codex-rs/utils/cli/src/approval_mode_cli_arg.rs:32`.
- `sandbox_mode` controls sandbox policy, see `codex/codex-rs/core/src/config/mod.rs:909`.
- MCP app/tool approval includes “remember this choice for this session”, see `codex/codex-rs/core/src/mcp_tool_call.rs:439`.

### Tool inventory (core + conditional)

Core tools (depending on shell/features):
- `exec_command`, `write_stdin`, see `codex/codex-rs/core/src/tools/spec.rs:1448`, `codex/codex-rs/core/src/tools/spec.rs:1449`.
- `shell_command`, see `codex/codex-rs/core/src/tools/spec.rs:1457`.
- `update_plan`, see `codex/codex-rs/core/src/tools/spec.rs:1478`.
- `request_user_input`, see `codex/codex-rs/core/src/tools/spec.rs:1489`.
- `apply_patch`, see `codex/codex-rs/core/src/tools/spec.rs:1500`.
- `web_search`, see `codex/codex-rs/core/src/tools/spec.rs:1549`.
- `view_image`, see `codex/codex-rs/core/src/tools/spec.rs:1563`.

Multi-agent tools:
- `spawn_agent`, `send_input`, `resume_agent`, `wait`, `close_agent`, see `codex/codex-rs/core/src/tools/spec.rs:1566`, `codex/codex-rs/core/src/tools/spec.rs:1577`.

Optional/experimental tools:
- `grep_files`, `read_file`, `list_dir`, `test_sync_tool`, gated by `experimental_supported_tools`, see `codex/codex-rs/core/src/tools/spec.rs:1512`, `codex/codex-rs/core/src/tools/spec.rs:1521`, `codex/codex-rs/core/src/tools/spec.rs:1530`, `codex/codex-rs/core/src/tools/spec.rs:1540`.

MCP resource tools:
- `list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`, see `codex/codex-rs/core/src/tools/spec.rs:1470`, `codex/codex-rs/core/src/tools/spec.rs:1475`.

### Practical Codex preapprove baseline

Example `~/.codex/config.toml`:

```toml
approval_policy = "never"
sandbox_mode = "workspace-write"
web_search = "live"

[tools]
web_search = true
view_image = true

[projects."/absolute/path/to/repo"]
trust_level = "trusted"
```
