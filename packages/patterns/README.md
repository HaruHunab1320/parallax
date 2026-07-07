# @parallaxai/patterns

The parallax pattern contract and the built-in pattern library.

**A pattern is a TypeScript module deployed with the control plane** — like a
Temporal workflow — not a script uploaded at runtime. The engine selects
agents, fans the task out, and hands the collected results to your module;
the module aggregates and decides, using
[`@parallaxai/confidence`](../confidence) for the uncertainty algebra.

```ts
import { averageConfidence, cf } from '@parallaxai/confidence';
import type { PatternModule } from '@parallaxai/patterns';

export const myConsensus: PatternModule = {
  meta: {
    name: 'MyConsensus',
    version: '1.0.0',
    description: 'Average-confidence consensus',
    minAgents: 2,
  },
  async execute(ctx) {
    const avg = averageConfidence(
      ctx.results.map((r) => cf(r.result, r.confidence))
    );
    return cf({ status: avg > 0.7 ? 'agreed' : 'weak', avg }, avg);
  },
};
```

Register the module in `src/index.ts`'s manifest and it is loadable by name
through the control plane (`ExecutePattern`), alongside org-chart YAML
patterns (which execute via the workflow executor instead).

## The context

`execute(ctx)` receives:

- `ctx.input` — the ExecutePattern request input
- `ctx.agents` — the selected agents (id, name, capabilities, expertise)
- `ctx.results` — every fan-out response `{ agentId, agentName, result,
  confidence, reasoning, error? }`, failures included at confidence 0
- `ctx.successfulResults` — `results` filtered to confidence > 0
- `ctx.workspace` — git workspace info when the pattern requested one
- `ctx.logger` — structured (pino) logger scoped to the execution

Return a `Confident<T>` — the value becomes the execution result, the
confidence drives routing, caching, and escalation upstream.

## Built-in library

The modules under `src/patterns/` are the platform's stock patterns —
consensus building, confidence cascades, uncertainty routing, voting,
map-reduce, and domain workflows. They were converted 1:1 from the retired
Prism DSL pattern library; output shapes are preserved, and files note the
few places the originals' behavior was buggy or unreachable.
