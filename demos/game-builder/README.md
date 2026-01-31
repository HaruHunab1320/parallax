# Game Builder Demo

**The flagship Parallax demo** - Watch AI agents collaboratively build a complete Pong game from scratch.

This demo showcases the entire Parallax stack working together:

- **Control Plane** - Orchestrates the execution
- **Agent Runtime** - Spawns and manages Claude agents
- **Workspace Service** - Clones repos, creates branches, opens PRs
- **Org-Chart Patterns** - Hierarchical team coordination
- **Tracing & Metrics** - Full observability via Jaeger and Grafana
- **Web Dashboard** - Real-time execution monitoring

## What Happens

When you run this demo:

1. **Infrastructure starts** - PostgreSQL, etcd, Redis, Jaeger, Grafana
2. **Control plane boots** - Loads the `pong-builder` org-chart pattern
3. **Workspace provisioned** - Clones your repo, creates a feature branch
4. **Team assembled**:
   - 🏗️ **Game Architect** (singleton) - Designs the game structure
   - 👨‍💻 **Game Engineers** (2-4) - Implement components in parallel
5. **Workflow executes**:
   - Architect creates technical specification
   - Engineers implement HTML and JavaScript in parallel
   - Architect reviews the implementation
   - Fixes applied if needed
6. **PR created** - With complete, playable Pong game!

## Prerequisites

- Docker and docker compose
- Node.js 18+
- pnpm
- GitHub account with a repo for the game
- GitHub Personal Access Token (PAT) with `repo` scope

### Create a GitHub PAT

1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select `repo` scope
4. Copy the token

### Create a Target Repo

Create an empty GitHub repo where the game will be built:

```bash
gh repo create my-pong-game --public --clone
```

## Quick Start

```bash
# From repo root
cd demos/game-builder

# Install dependencies
pnpm install

# Run the full demo
./scripts/run-demo.sh --repo YOUR_USERNAME/my-pong-game --token ghp_YOUR_TOKEN
```

## Manual Step-by-Step

If you prefer to run components separately:

```bash
# 1. Start infrastructure
pnpm start:infra

# 2. In a new terminal - start control plane
pnpm start:control-plane

# 3. In a new terminal - start dashboard (optional)
pnpm start:dashboard

# 4. Run the game builder
pnpm build-game --repo YOUR_USERNAME/my-pong-game --token ghp_YOUR_TOKEN --watch
```

## Viewing the Execution

### Web Dashboard (http://localhost:3001)

- Real-time execution status
- Agent activity
- Metrics and charts

### Jaeger Tracing (http://localhost:16686)

- Full trace of execution
- Agent communication timeline
- Performance analysis

### Grafana (http://localhost:3001)

- System metrics
- Execution trends
- Agent performance

## The Org-Chart Pattern

The demo uses an **org-chart pattern** that defines a hierarchical team:

```yaml
structure:
  roles:
    architect:
      singleton: true
      capabilities: [architecture, code_review, game_design]

    engineer:
      reportsTo: architect
      minInstances: 2
      maxInstances: 4
      capabilities: [implementation, javascript]

workflow:
  steps:
    - assign architect: "Design the game"
    - parallel:
        - assign engineer: "Implement HTML"
        - assign engineer: "Implement JavaScript"
    - review: architect
    - condition:
        if: approved
        then: finalize
        else: fix and re-review
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Command                              │
│            pnpm build-game --repo x/y --token z                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Control Plane                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │   Pattern    │ │   Workspace  │ │   Execution  │            │
│  │   Engine     │ │   Service    │ │   Engine     │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌───────────┐       ┌───────────┐       ┌───────────┐
    │ Architect │       │ Engineer  │       │ Engineer  │
    │  Agent    │──────▶│  Agent 1  │       │  Agent 2  │
    │ (Claude)  │       │ (Claude)  │       │ (Claude)  │
    └───────────┘       └───────────┘       └───────────┘
          │                   │                   │
          └───────────────────┴───────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │   Git Workspace   │
                    │ (cloned repo)     │
                    │                   │
                    │ ├── index.html    │
                    │ └── game.js       │
                    └───────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │   Pull Request    │
                    │   on GitHub       │
                    └───────────────────┘
```

## Output

After successful execution:

```
╔═══════════════════════════════════════════════════════════════╗
║                    PARALLAX GAME BUILDER                      ║
╚═══════════════════════════════════════════════════════════════╝

🔍 Checking control plane...
   ✓ Control plane healthy (ok)

🚀 Submitting game build request...
   ✓ Execution started: exec-abc123

📊 Execution Progress:
────────────────────────────────────────────────────────────────
   [10:00:01] 🎬 Execution started: pong-builder
   [10:00:02] 📁 Provisioning workspace for myorg/my-pong...
   [10:00:05] 📁 Workspace ready: parallax/exec-abc123/agent/pong
   [10:00:06] 🤖 Selected 3 agents
   [10:00:06] 🤖 Agent started: Game Architect (arch-123)
   [10:00:06] 🤖 Agent started: Game Engineer (eng-456)
   [10:00:06] 🤖 Agent started: Game Engineer (eng-789)
   [10:00:15] ✓ Agent completed: Game Architect (95% confidence)
   [10:00:30] ✓ Agent completed: Game Engineer (92% confidence)
   [10:00:32] ✓ Agent completed: Game Engineer (94% confidence)
   [10:00:35] ⚡ Pattern execution complete
   [10:00:36] 🔗 PR created: https://github.com/myorg/my-pong/pull/1
   [10:00:36] 🎉 Execution completed!

════════════════════════════════════════════════════════════════

🎉 GAME BUILD COMPLETE!

   📦 Pull Request: https://github.com/myorg/my-pong/pull/1
   ⏱  Duration: 35.2s
   🤖 Agents used: 3
   📝 Steps executed: 4

   Next steps:
   1. Review the PR on GitHub
   2. Merge to deploy the game
   3. Open index.html to play!

════════════════════════════════════════════════════════════════
```

## Troubleshooting

### Control plane not starting

```bash
# Check if ports are in use
lsof -i :3000
lsof -i :5435
lsof -i :2389

# View control plane logs
docker logs parallax-postgres
docker logs parallax-etcd
```

### Agent execution failing

1. Check Jaeger for trace details: http://localhost:16686
2. View control plane logs in terminal
3. Ensure Claude CLI is installed: `claude --version`

### Workspace provisioning failing

1. Verify your GitHub PAT has `repo` scope
2. Check if the repo exists and you have write access
3. Try with `--watch` to see detailed events

## Clean Up

```bash
# Stop infrastructure
pnpm stop:infra

# Or manually
docker compose --profile monitoring down

# Remove volumes (careful - deletes data)
docker compose --profile monitoring down -v
```

## Next Steps

- Modify `patterns/pong-builder.yaml` to add features (sound, AI opponent)
- Create patterns for other games (snake, tetris)
- Add more agent roles (QA tester, documentation writer)
- Deploy the game to GitHub Pages
