# Pattern Demo

This demo showcases the high-level pattern orchestration capabilities of Parallax using the Prism pattern language.

## What It Demonstrates

- Loading and parsing `.prism` pattern files
- Pattern orchestration with the PatternEngine
- Multi-agent coordination strategies
- Service discovery with etcd
- Real-world coordination patterns like:
  - **Consensus Builder**: Multiple agents reach consensus on analysis
  - **Epistemic Orchestrator**: Identifies valuable disagreements between experts
  - **Uncertainty Router**: Routes tasks based on uncertainty levels
  - **Confidence Cascade**: Cascades through agents based on confidence thresholds

## Prerequisites

This demo requires etcd for service discovery and agent registration.

### Option 1: Run etcd with Docker
```bash
docker run -d -p 2379:2379 --name etcd quay.io/coreos/etcd:latest
```

### Option 2: Install etcd locally
```bash
# macOS
brew install etcd
etcd

# Linux
# Download from https://github.com/etcd-io/etcd/releases
```

## Running the Demo

1. Start etcd (see prerequisites above)

2. Run the pattern demo:
```bash
npm run demo:patterns
```

## What Happens

1. **Without etcd**: The demo will load and display all available patterns but won't be able to execute them
2. **With etcd**: The demo will:
   - Register mock agents in etcd
   - Load pattern files from the `/patterns` directory
   - Execute example patterns showing multi-agent coordination
   - Display execution results with confidence metrics

## Understanding the Output

- Pattern loading shows all available `.prism` patterns
- Each pattern execution shows:
  - Execution ID
  - Status (completed/failed)
  - Results from agent coordination
  - Confidence metrics
  - Execution time and performance metrics

## Next Steps

- Explore the pattern files in `/patterns/*.prism`
- Create your own patterns using the Prism language
- Run actual agents that register with etcd
- See the `demo-app` for low-level agent implementation