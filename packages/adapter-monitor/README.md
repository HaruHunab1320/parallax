# agent-adapter-monitor

Automated CLI adapter monitoring - captures startup snapshots and detects pattern changes across versions.

## Overview

CLI coding agents (Claude Code, Gemini CLI, Codex, Aider) frequently update their startup screens, prompts, and ANSI formatting. This can break the `detectReady`, `detectLogin`, and `detectBlockingPrompt` patterns in `coding-agent-adapters`.

This package automatically:
1. **Monitors** CLI package registries (npm, PyPI) for new releases
2. **Captures** startup snapshots in isolated Docker containers
3. **Analyzes** output to detect pattern changes
4. **Creates PRs** when patterns need updating

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Check        │───>│ Capture      │───>│ Analyze &    │      │
│  │ Versions     │    │ Snapshots    │    │ Create PR    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         v                   v                   v               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ npm/PyPI/    │    │ Docker       │    │ Pattern      │      │
│  │ GitHub API   │    │ Isolation    │    │ Diff         │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘

                              │
                              v

┌─────────────────────────────────────────────────────────────────┐
│                     Snapshot Storage                             │
├─────────────────────────────────────────────────────────────────┤
│  snapshots/                                                      │
│  ├── claude/                                                     │
│  │   ├── 1_0_0.json          # Snapshot for v1.0.0              │
│  │   ├── 1_1_0.json          # Snapshot for v1.1.0              │
│  │   ├── history.json        # Version → patterns mapping        │
│  │   └── latest.json         # Symlink to latest                │
│  ├── gemini/                                                     │
│  ├── codex/                                                      │
│  └── aider/                                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Usage

### Check for version updates

```bash
npx tsx src/cli.ts check-versions

# Output:
# ✓  Current claude: 1.0.5 → 1.0.5
# ⬆️  UPDATE gemini: 0.2.0 → 0.3.0
# ✓  Current codex: 2.1.0 → 2.1.0
# ✓  Current aider: 0.50.0 → 0.50.0
```

### Capture a snapshot

```bash
# With Docker isolation (recommended)
npx tsx src/cli.ts capture --adapter gemini --version 0.3.0 --docker

# Local capture (less isolated)
npx tsx src/cli.ts capture --adapter gemini --version 0.3.0
```

### Analyze patterns

```bash
# Analyze all adapters
npx tsx src/cli.ts analyze --all

# Analyze specific adapter
npx tsx src/cli.ts analyze --adapter gemini
```

### Compare versions

```bash
npx tsx src/cli.ts diff --adapter gemini --old 0.2.0 --new 0.3.0

# Output:
# gemini 0.2.0 → 0.3.0: +1 ready patterns, -1 auth patterns
#
# Added ready patterns:
#   + Type your message
# Removed auth patterns:
#   - Old auth prompt
```

## Snapshot Format

```json
{
  "adapter": "gemini",
  "version": "0.3.0",
  "timestamp": "2024-01-15T12:00:00Z",
  "captureDurationMs": 15000,
  "rawOutput": "...",
  "strippedOutput": "...",
  "lines": ["...", "..."],
  "patterns": [
    {
      "type": "ready",
      "text": "Type your message",
      "lineNumber": 42,
      "confidence": 0.9
    }
  ],
  "authRequired": true,
  "reachedReady": false
}
```

## Version History Format

```json
{
  "adapter": "gemini",
  "latestVersion": "0.3.0",
  "versions": {
    "0.2.0": {
      "version": "0.2.0",
      "firstCaptured": "2024-01-01T00:00:00Z",
      "lastUpdated": "2024-01-01T00:00:00Z",
      "readyPatterns": ["Ready", "How can I help"],
      "authPatterns": ["GEMINI_API_KEY"],
      "blockingPatterns": ["[y/n]"],
      "updatePatterns": ["update available"]
    },
    "0.3.0": {
      "version": "0.3.0",
      "readyPatterns": ["Type your message", "How can I help"],
      "..."
    }
  }
}
```

## Dynamic Pattern Loading

The version history can be used by `coding-agent-adapters` to load the correct patterns for a specific CLI version:

```typescript
import { getPatternsForVersion } from 'agent-adapter-monitor';

// Get patterns for a specific version
const patterns = await getPatternsForVersion('gemini', '0.3.0');

if (patterns) {
  // Use patterns.readyPatterns, patterns.authPatterns, etc.
}
```

## GitHub Actions Workflow

The workflow runs:
- **Daily** at midnight UTC (cron)
- **Manually** via workflow_dispatch

When updates are detected:
1. Builds Docker image for each updated CLI
2. Runs CLI in isolated container (no auth, clean config)
3. Captures PTY output for 30 seconds
4. Analyzes patterns and saves snapshot
5. Creates PR if patterns changed

## Configuration

Monitored CLIs are configured in `src/config.ts`:

```typescript
export const MONITORED_CLIS = {
  claude: {
    registry: 'npm',
    package: '@anthropic-ai/claude-code',
    command: 'claude',
    ...
  },
  // ...
};
```

## Requirements

- Node.js 18+
- Docker (for isolated captures)
- GitHub token (for higher API rate limits)
