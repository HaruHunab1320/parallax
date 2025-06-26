# Pattern Demo - Parallax

This demo shows how patterns are loaded and executed in the Parallax platform.

## How Patterns Work

1. **Pattern Files**: Patterns are written in `.prism` files located in the `/patterns` directory
2. **Pattern Loading**: The `PatternEngine` scans the patterns directory and loads all `.prism` files
3. **Pattern Execution**: When a pattern is executed, the Prism code runs with access to registered agents

## Pattern Structure

Each pattern file has:
- Metadata in comments (`@name`, `@version`, `@description`, etc.)
- Prism code that orchestrates agents
- Access to `parallax.agents` and other platform features

## Running the Demo

```bash
# From the monorepo root
pnpm --filter @parallax/pattern-demo dev

# Or from this directory
pnpm dev
```

## What Happens

1. The demo initializes a `PatternEngine` pointing to `/patterns`
2. It loads all 4 patterns we created:
   - `consensus-builder.prism`
   - `epistemic-orchestrator.prism`
   - `uncertainty-router.prism`
   - `confidence-cascade.prism`
3. It executes each pattern with sample data
4. Results show how patterns coordinate agents based on confidence

## Pattern Directory

The patterns are located at `/patterns` in the root of the monorepo:

```
parallax/
├── patterns/
│   ├── consensus-builder.prism
│   ├── epistemic-orchestrator.prism
│   ├── uncertainty-router.prism
│   └── confidence-cascade.prism
```

## Adding New Patterns

1. Create a new `.prism` file in `/patterns`
2. Add metadata comments
3. Write Prism code
4. Restart the demo to load the new pattern

## Pattern Context

When patterns execute, they have access to:
- `input` - The input data passed to the pattern
- `parallax.agents` - All registered agents
- Prism language features (confidence operators, uncertain if, etc.)
- Helper functions injected by the runtime