# Parallax Agent Docker Images

Docker images for running AI coding assistants as Parallax agents.

## Available Images

| Image | Description | CLI Tool |
|-------|-------------|----------|
| `parallax/agent-base` | Base image with common dependencies | - |
| `parallax/agent-claude` | Claude Code CLI agent | `claude` |
| `parallax/agent-codex` | OpenAI Codex CLI agent | `codex` |
| `parallax/agent-gemini` | Google Gemini CLI agent | `gemini` |
| `parallax/agent-aider` | Aider AI coding assistant | `aider` |

## Building Images

### Build All Images

```bash
# From the runtime-docker package directory
pnpm docker:build

# Or using the script directly
./scripts/build-images.sh
```

### Build Specific Image

```bash
pnpm docker:build:claude
pnpm docker:build:codex
pnpm docker:build:gemini
pnpm docker:build:aider
```

### Build and Push

```bash
# Build and push all images
pnpm docker:push

# Or with custom registry
PARALLAX_REGISTRY=myregistry.io/parallax ./scripts/build-images.sh --push
```

### Using Docker Compose

```bash
# Build all images
docker compose -f docker-compose.build.yml build

# Push all images
docker compose -f docker-compose.build.yml push
```

## Running Agents

### Basic Usage

```bash
# Run Claude agent
docker run -it --rm \
  -e ANTHROPIC_API_KEY=your-key \
  -v $(pwd):/workspace \
  parallax/agent-claude

# Run Aider agent
docker run -it --rm \
  -e ANTHROPIC_API_KEY=your-key \
  -v $(pwd):/workspace \
  parallax/agent-aider
```

### With Parallax Runtime

The images are designed to be managed by the Parallax Docker Runtime. Configure the runtime URL in your control plane:

```bash
export PARALLAX_DOCKER_RUNTIME_URL=http://localhost:8081
```

## Environment Variables

### Common Variables (all images)

| Variable | Description |
|----------|-------------|
| `AGENT_ID` | Unique agent identifier |
| `AGENT_NAME` | Human-readable agent name |
| `AGENT_TYPE` | Agent type (claude, codex, gemini, aider) |
| `AGENT_ROLE` | Org-chart role (architect, engineer, etc.) |
| `AGENT_CAPABILITIES` | JSON array of capabilities |
| `PARALLAX_REGISTRY_ENDPOINT` | Control plane URL for auto-registration |

### Claude-Specific

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_MODEL` | Model to use (default: claude-sonnet-4-20250514) |
| `CLAUDE_CODE_TELEMETRY` | Disable telemetry (set to `false`) |

### Codex-Specific

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |

### Gemini-Specific

| Variable | Description |
|----------|-------------|
| `GOOGLE_API_KEY` | Google AI API key |

### Aider-Specific

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (or OPENAI_API_KEY) |
| `AIDER_NO_AUTO_COMMITS` | Disable auto-commits |
| `AIDER_YES` | Auto-confirm prompts |

## Image Architecture

```
parallax/agent-base (node:20-alpine)
├── Common dependencies (git, python, node tools)
├── Agent user (non-root)
├── Entrypoint script for Parallax integration
│
├── parallax/agent-claude
│   └── Claude Code CLI
│
├── parallax/agent-codex
│   └── OpenAI Codex CLI
│
├── parallax/agent-gemini
│   └── Google Gemini CLI
│
└── parallax/agent-aider
    └── Aider (pip package)
```

## Customization

### Adding Custom Tools

Create a custom Dockerfile extending the base:

```dockerfile
FROM parallax/agent-base:latest

USER root
RUN npm install -g your-custom-tool
USER agent

CMD ["your-custom-tool"]
```

### Custom Entrypoint

The base image uses `/entrypoint.sh` which:
1. Optionally registers with Parallax control plane
2. Creates input pipe for receiving commands
3. Handles graceful shutdown

You can override this by providing your own entrypoint.

## Troubleshooting

### API Key Issues

If you see "API key not found" errors:
1. Ensure the correct environment variable is set
2. Check if the key has proper permissions
3. Verify the key is valid for the model you're using

### Container Exits Immediately

The containers expect to run in interactive mode or receive commands via the `/tmp/agent-input` pipe. For standalone testing:

```bash
docker run -it parallax/agent-claude
```

### Permission Issues

The agent user has limited permissions by default. Mount volumes with appropriate ownership:

```bash
docker run -it \
  -v $(pwd):/workspace \
  -u $(id -u):$(id -g) \
  parallax/agent-claude
```
