# Claude Capture Prompt Catalog (Latest Run)

Source capture:
- Run: `claude-interactive-2026-02-23T00-54-32-974Z-9f01aa68`
- Session: `pty-1771808072976-45da1278`
- Files:
  - `.parallax/pty-captures/claude-interactive-2026-02-23T00-54-32-974Z-9f01aa68/pty-1771808072976-45da1278/pty-1771808072976-45da1278.raw-events.jsonl`
  - `.parallax/pty-captures/claude-interactive-2026-02-23T00-54-32-974Z-9f01aa68/pty-1771808072976-45da1278/pty-1771808072976-45da1278.states.jsonl`
  - `.parallax/pty-captures/claude-interactive-2026-02-23T00-54-32-974Z-9f01aa68/pty-1771808072976-45da1278/pty-1771808072976-45da1278.transitions.jsonl`

## Ready / Busy / Completion Markers

- `ready_for_input`
  - Observed text: `❯` and `❯ Try "..." ? for shortcuts`
  - Regex: `(?:^|\\s)(?:❯|›)\\s*(?:try\\s*"[^"]*")?\\s*(?:\\?\\s*for shortcuts)?\\s*$`
- `busy_streaming`
  - Observed text: `⏸ plan mode on (shift+tab to cycle)`, `Esc to interrupt`, loading verbs (`Flowing…`, `Cascading…`, etc.)
  - Regex: `plan mode on|esc\\s+to\\s+interrupt|\\b[a-z][a-z-]{4,}ing…\\b`
- `completed`
  - Observed text: `✻ Cooked for 41s`, `✻ Worked for 8m 19s`
  - Regex: `\\b(?:cooked|worked|baked|proofed|cogitated)\\s+for\\s+\\d+(?:h\\s+\\d+m\\s+\\d+s|m\\s+\\d+s|s)\\b`

## Survey / Feedback States

- Survey prompt:
  - `How is Claude doing this session? (optional)`
  - `1: Bad 2: Fine 3: Good 0: Dismiss`
  - Regex: `how\\s+is\\s+claude\\s+doing\\s+this\\s+session\\?\\s*\\(optional\\).*1:\\s*bad.*2:\\s*fine.*3:\\s*good.*0:\\s*dismiss`
- Survey acknowledgement:
  - `Thanks for helping make Claude better!`
  - `Use /feedback to share detailed feedback or file a bug.`
  - Regex: `thanks\\s+for\\s+helping\\s+make\\s+claude\\s+better`
- Privacy toggle context:
  - `Help improve Claude`
  - `Enter/Tab/Space to toggle · Esc to cancel`
  - Regex: `help\\s+improve\\s+claude|enter/tab/space\\s+to\\s+toggle`

## Menu / Dialog States Captured

- Slash menu rows observed:
  - `/add-dir Add a new working directory`
  - `/agents Manage agent configurations`
  - `/config Open config panel`
  - `/privacy-settings View and update your privacy settings`
  - `/remote-env Configure the default remote environment for...`
  - `/resume Resume a previous conversation`
  - `/skills List available skills`
  - `/tasks List and manage background tasks`
- Generic slash-menu detection regex:
  - `/(?:add-dir|agents|config|privacy-settings|remote-env|resume|skills|tasks)\\b`

### `/agents` dialog

- Observed:
  - `Agents`
  - `No agents found`
  - `Create new agent`
  - `Choose location`
  - `1. Project (.claude/agents/)`
  - `2. Personal (~/.claude/agents/)`
  - `Generate with Claude (recommended)`
  - `Manual configuration`
  - `Press ↑↓ to navigate · Enter to select · Esc to go back`
  - `Agents dialog dismissed`
- Detection regex:
  - `no\\s+agents\\s+found|create\\s+new\\s+agent|project\\s*\\(\\.claude/agents/\\)|personal\\s*\\(~/\\.claude/agents/\\)`

### `/chrome` dialog

- Observed:
  - `Claude in Chrome (Beta)`
  - `Status: Disabled`
  - `Extension: Not detected`
  - `Install Chrome extension`
  - `Manage permissions (requires extension)`
  - `Reconnect extension (requires extension)`
  - `Enter to confirm · Esc to cancel`
- Detection regex:
  - `claude\\s+in\\s+chrome\\s+\\(beta\\)|install\\s+chrome\\s+extension|reconnect\\s+extension`

### `/add-dir` dialog

- Observed:
  - `Add directory to workspace`
  - `Enter the path to the directory:`
  - `Directory path...`
  - `Tab to complete · Enter to add · Esc to cancel`
  - `Did not add a working directory.`
- Detection regex:
  - `add\\s+directory\\s+to\\s+workspace|enter\\s+the\\s+path\\s+to\\s+the\\s+directory|did\\s+not\\s+add\\s+a\\s+working\\s+directory`

### `/skills` dialog

- Observed:
  - `Skills`
  - `No skills found`
  - `Create skills in .claude/skills/ or ~/.claude/skills/`
  - `Esc to close`
  - `Skills dialog dismissed`
- Detection regex:
  - `no\\s+skills\\s+found|skills\\s+dialog\\s+dismissed`

### `/tasks` dialog

- Observed:
  - `Background tasks`
  - `No task currently running`
  - `↑/↓ to select · Enter to view · Esc to close`
  - `Background tasks dialog dismissed`
- Detection regex:
  - `background\\s+tasks|no\\s+task\\s+currently\\s+running|tasks\\s+dialog\\s+dismissed`

### `/remote-env` dialog

- Observed:
  - `Select Remote Environment`
  - `Loading environments...`
  - `Configure environments at: https://claude.ai/code`
  - `Using Default (env_...)`
  - `Enter to confirm · Esc to cancel`
- Detection regex:
  - `select\\s+remote\\s+environment|configure\\s+environments\\s+at:\\s+https://claude\\.ai/code|using\\s+default\\s*\\(env_[a-z0-9]+\\)`

## Prompt / Interrupt States

- Observed:
  - `Interrupted · What should Claude do instead?`
  - `Press Ctrl-C again to exit`
  - `Update available! Run: brew upgrade claude-code`
- Detection regex:
  - `interrupted\\s*·\\s*what\\s+should\\s+claude\\s+do\\s+instead\\?`
  - `press\\s+ctrl-c\\s+again\\s+to\\s+exit`
  - `update\\s+available!\\s+run:\\s+brew\\s+upgrade\\s+claude-code`

## SendKey Sequence Starters (for adapter automation)

- Open slash command menu:
  - `"/"`
- Navigate slash menu:
  - `"<DOWN>"` repeated, then `"<CR>"`
- Cancel/close current dialog:
  - `"<ESC>"`
- Confirm selected option:
  - `"<CR>"`
- Survey handling:
  - Dismiss: `"0<CR>"`
  - Good: `"3<CR>"`
- Agent creation skeleton:
  - `"/agents<CR><CR><DOWN><CR><CR>"`
  - (open agents, select create, choose location, continue)
