# Golden Ticket Demo Prep

This folder contains scaffolding for the Golden Ticket swarm demo.

## 1) Agent Wiring (Gemini 3)
- Use the Pattern SDK Gemini provider to generate patterns or compose plans.
- Exported helpers: `GeminiProvider` and `createGeminiProvider` from `@parallax/pattern-sdk`.

Example (pattern generation):
```ts
import { PatternGenerator, createGeminiProvider } from '@parallax/pattern-sdk';

const generator = new PatternGenerator({
  llm: createGeminiProvider(process.env.GEMINI_API_KEY, 'gemini-3-pro-preview')
});

const pattern = await generator.generate({
  goal: 'Swarm planner with review loop',
  strategy: 'consensus',
  minConfidence: 0.8
});

await generator.save(pattern, './patterns/examples/golden-ticket/swarm-orchestrator.prism');
```

## 2) Swarm Demo Patterns
Patterns live in `patterns/examples/golden-ticket/`:
- `swarm-orchestrator.prism`
- `swarm-sharder.prism`
- `swarm-review.prism`
- `swarm-test-loop.prism`

These use the pre-processed `agentResults` context emitted by the control plane.

## 3) Scenario Compile + Run
Use the CLI scenario helper to generate a Prism pattern from a structured spec:
```bash
parallax scenario compile examples/golden-ticket/scenario.yaml -o ./patterns/golden-ticket-swarm.prism
parallax scenario run examples/golden-ticket/scenario.yaml --input '{"objective":"demo"}'
```

## 4) Demo Harness
For a one-command flow, create a shell script that:
1. Starts the control plane.
2. Starts a few local agents.
3. Runs `parallax scenario run` with streaming enabled.

The existing execution streaming now emits detailed event payloads over gRPC and WebSocket.
