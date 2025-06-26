# Parallax Demo Application

This demo showcases the core capabilities of the Parallax platform:

## Features Demonstrated

1. **Agent Registration** - Creating and registering specialized agents
2. **Confidence Tracking** - Agents return results with confidence levels
3. **Parallel Analysis** - Multiple agents analyze the same task
4. **Consensus Building** - Determining agreement between agents
5. **High-Confidence Disagreements** - Detecting when experts disagree

## Running the Demo

```bash
# From the root directory
pnpm --filter @parallax/demo-app dev

# Or from this directory
pnpm dev
```

## What It Does

The demo:
1. Creates two specialized agents (Security and Architecture)
2. Analyzes a code snippet with security vulnerabilities
3. Shows how different agents have different perspectives
4. Demonstrates consensus calculation
5. Shows when parallel exploration might be needed

## Key Concepts

- **Agents publish confidence**: Every result includes a confidence score (0.0-1.0)
- **Disagreement is valuable**: When experts disagree with high confidence, it reveals trade-offs
- **Parallel by default**: When uncertain, explore multiple approaches