# agent-adapter-monitor

Automated CLI adapter monitoring - detects source file changes across versions and captures startup snapshots to validate adapter patterns.

## Overview

CLI coding agents (Claude Code, Gemini CLI, Codex, Aider) frequently update their prompts, auth flows, and UI rendering. This can break the `detectReady`, `detectLogin`, and `detectBlockingPrompt` patterns in `coding-agent-adapters`.

This package provides two complementary monitoring approaches:

1. **Source file tracking** - Knows exactly which source files in each CLI repo contain prompt/auth/ready/exit logic. When a new version is released, checks if any of those files changed via the GitHub Compare API.
2. **Startup snapshot capture** - Captures CLI startup output in Docker containers for pattern extraction and comparison.

## Watched Source Files

Each CLI adapter has a curated list of source files derived from deep analysis of the CLI's open-source codebase. Files are categorized by what they control:

| Category | Description | Example |
|----------|-------------|---------|
| `auth` | Login flows, API key validation, OAuth | `AuthDialog.tsx`, `onboarding.py` |
| `blocking_prompt` | Confirmations, trust dialogs, tool approval | `io.py`, `approval_overlay.rs` |
| `ready_detection` | Input prompts, composer UI | `InputPrompt.tsx`, `chat_composer.rs` |
| `exit_detection` | Logout, shutdown, version update | `versioncheck.py` |
| `framework` | Rendering, spinners, TUI framework | `gemini.tsx`, `render.rs` |
| `startup` | Tips, warnings, banners | `Tips.tsx`, `welcome.rs` |

### File counts per CLI

| CLI | Repo | Watched Files |
|-----|------|--------------|
| Gemini CLI | `google-gemini/gemini-cli` | 18 files |
| OpenAI Codex | `openai/codex` | 15 files |
| Aider | `Aider-AI/aider` | 12 files |
| Claude Code | `anthropics/claude-code` | 2 files |

## Usage

### Check for source file changes between versions

The primary workflow: when a new CLI version is released, check if any watched files changed.

```bash
npx tsx src/cli.ts check-changes --adapter aider --old 0.81.0 --new 0.82.0

# Output:
# aider: 0.81.0 -> 0.82.0 (15 commits)
#   2 watched file(s) changed:
#     [blocking_prompt]
#       modified: aider/io.py
#       modified: aider/main.py
#   2 critical file(s) changed - adapter update recommended.
```

When `adapterUpdateNeeded` is true, the adapter patterns should be reviewed and potentially updated.

```bash
# JSON output for CI integration
npx tsx src/cli.ts check-changes --adapter gemini --old 1.0.0 --new 1.1.0 --json
```

### List watched files

```bash
# List all watched files for a specific adapter
npx tsx src/cli.ts watched-files --adapter gemini

# Output:
# gemini (google-gemini/gemini-cli):
#   [auth]
#     packages/cli/src/ui/auth/AuthDialog.tsx
#     packages/cli/src/ui/auth/ApiAuthDialog.tsx
#     ...
#   [blocking_prompt]
#     packages/cli/src/ui/components/FolderTrustDialog.tsx
#     ...

# List all adapters
npx tsx src/cli.ts watched-files --all --json
```

### Check for version updates

```bash
npx tsx src/cli.ts check-versions

# Output:
# Current claude: 1.0.5 -> 1.0.5
# UPDATE gemini: 0.2.0 -> 0.3.0
# Current codex: 2.1.0 -> 2.1.0
# Current aider: 0.50.0 -> 0.50.0
```

### Capture a startup snapshot

```bash
# With Docker isolation (recommended)
npx tsx src/cli.ts capture --adapter gemini --version 0.3.0 --docker

# Local capture (less isolated)
npx tsx src/cli.ts capture --adapter gemini --version 0.3.0
```

### Analyze and compare patterns

```bash
# Analyze all adapters
npx tsx src/cli.ts analyze --all

# Compare specific versions
npx tsx src/cli.ts diff --adapter gemini --old 0.2.0 --new 0.3.0
```

## Programmatic API

### File Change Checking

```typescript
import { checkFileChanges, listWatchedFiles, getWatchedFiles } from 'agent-adapter-monitor';

// Check which watched files changed between versions
const result = await checkFileChanges('aider', '0.81.0', '0.82.0');

console.log(result.changedFiles);
// [{ path: 'aider/io.py', category: 'blocking_prompt', status: 'modified' }]

console.log(result.adapterUpdateNeeded);
// true (critical files changed)

console.log(result.summary);
// Human-readable summary

// List files grouped by category
const grouped = listWatchedFiles('gemini');
// { auth: ['AuthDialog.tsx', ...], blocking_prompt: [...], ... }

// Get raw config
const config = getWatchedFiles('codex');
// { adapter: 'codex', githubRepo: 'openai/codex', watchedFiles: [...] }
```

### Version Checking

```typescript
import { checkAllVersions, filterUpdatesAvailable } from 'agent-adapter-monitor';

const results = await checkAllVersions({ gemini: '0.2.0', aider: '0.81.0' });
const updates = filterUpdatesAvailable(results);
```

### Dynamic Pattern Loading

```typescript
import { getPatternsForVersion } from 'agent-adapter-monitor';

const patterns = await getPatternsForVersion('gemini', '0.3.0');
if (patterns) {
  // Use patterns.readyPatterns, patterns.authPatterns, etc.
}
```

## Architecture

```
                    Version Released
                          |
                          v
               +-------------------+
               | check-versions    |  npm/PyPI/GitHub API
               +-------------------+
                          |
              +-----------+-----------+
              |                       |
              v                       v
   +-------------------+   +-------------------+
   | check-changes     |   | capture           |  Source file tracking
   | (GitHub Compare)  |   | (Docker snapshot)  |  vs runtime capture
   +-------------------+   +-------------------+
              |                       |
              v                       v
   +-------------------+   +-------------------+
   | adapterUpdate     |   | Pattern diff &    |
   | Needed: true/false|   | analysis          |
   +-------------------+   +-------------------+
```

## Configuration

Monitored CLIs are configured in `src/config.ts`, watched files in `src/watched-files.ts`:

```typescript
import { MONITORED_CLIS } from './config';
import { WATCHED_FILES } from './watched-files';

MONITORED_CLIS.aider;
// { type: 'aider', registry: 'pip', package: 'aider-chat', githubRepo: 'Aider-AI/aider', ... }

WATCHED_FILES.aider;
// { adapter: 'aider', githubRepo: 'Aider-AI/aider', watchedFiles: [
//   { path: 'aider/io.py', category: 'blocking_prompt' },
//   { path: 'aider/onboarding.py', category: 'auth' },
//   ...
// ] }
```

## Requirements

- Node.js 18+
- Docker (for isolated snapshot captures)
- `GITHUB_TOKEN` environment variable (for higher API rate limits on file change checks)
