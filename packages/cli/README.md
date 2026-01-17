# Parallax CLI

Command-line interface for the Parallax AI orchestration platform.

## Installation

```bash
# From the monorepo root
pnpm --filter @parallax/cli build

# Link globally
pnpm --filter @parallax/cli link --global

# Or run directly
pnpm --filter @parallax/cli dev
```

## Commands

### Platform Management

```bash
# Start the platform locally
parallax start

# Start with options
parallax start --detached --port 8080

# Check platform status
parallax status
parallax status --json
```

### Agent Management

```bash
# Register a new agent
parallax agent register ./my-agent.ts --name "My Agent" --capabilities analysis security

# List all agents
parallax agent list

# Filter by capabilities
parallax agent list --capabilities security

# View agent confidence history
parallax agent confidence-history security-agent-1

# Test an agent interactively
parallax agent test security-agent-1
```

### Pattern Execution

```bash
# Run a pattern by name
parallax run consensus-builder --input '{"task": "analyze code"}'

# Run a pattern from file
parallax run ./patterns/my-pattern.prism --file ./input.json

# Watch pattern file for changes
parallax run ./pattern.prism --watch

# Set confidence threshold
parallax run epistemic-orchestrator --min-confidence 0.8
```

### Pattern Management

```bash
# List available patterns
parallax pattern list
parallax pattern list --verbose

# Upload a new pattern
parallax pattern upload ./my-pattern.prism

# Validate a pattern
parallax pattern validate ./my-pattern.prism

# View execution history
parallax pattern history
parallax pattern history consensus-builder --limit 20
```

### Scenario Compilation

```bash
# Compile a scenario YAML/JSON into a Prism pattern
parallax scenario compile ./scenarios/scenarios.yaml --id launch_readiness_gate --output ./patterns/generated/launch-readiness.prism

# Override the default confidence threshold used by the generated pattern
parallax scenario compile ./scenarios/scenarios.yaml --id incident_response_bridge --confidence 0.82

# Compile + run against the control plane (requires Parallax running)
parallax scenario run ./scenarios/scenarios.yaml --id launch_readiness_gate --file ./input.json
```

## Examples

### Running a Security Analysis

```bash
# Create input file
echo '{"code": "function login(user, pass) { ... }"}' > input.json

# Run security analysis pattern
parallax run security-analysis --file input.json

# Check results with high confidence requirement
parallax run security-analysis --file input.json --min-confidence 0.9
```

### Monitoring Agent Performance

```bash
# Check all agents
parallax agent list

# Look at specific agent's history
parallax agent confidence-history security-agent-1 --days 30

# Test agent directly
parallax agent test security-agent-1
```

## Configuration

The CLI reads configuration from:
1. `~/.parallax/config.json` (user config)
2. `./.parallax.json` (project config)
3. Environment variables (PARALLAX_*)

Example config:
```json
{
  "controlPlane": {
    "endpoint": "localhost:8080"
  },
  "registry": {
    "endpoint": "localhost:50051"
  },
  "defaults": {
    "minConfidence": 0.7,
    "timeout": 30000
  }
}
```
