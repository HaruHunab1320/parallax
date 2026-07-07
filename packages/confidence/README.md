# @parallaxai/confidence

Confidence-carrying values and uncertainty-aware control flow for AI
orchestration, in plain TypeScript.

This library is the distilled semantics of the Prism DSL — the confidence
propagation algebra that made Prism interesting, without the language. Every
combinator is property-tested against the original propagation rules.

```ts
import { cf, add, best, coalesce, uncertain } from '@parallaxai/confidence';

const sensor1 = cf(23.1, 0.8);
const sensor2 = cf(22.9, 0.7);

add(sensor1, sensor2); // { value: 46, confidence: 0.7 }  ← min propagates

const answer = coalesce([gptResult, claudeResult, 'unknown']);
const winner = best(model1, model2, model3);

uncertain(analysis, {
  high: () => deployToProduction(),   // confidence ≥ 0.8
  medium: () => deployToStaging(),    // confidence ≥ 0.5
  low: () => requestHumanReview(),
});
```

## The type

```ts
interface Confident<T> {
  value: T;
  confidence: number; // 0..1
}
```

Plain data, JSON-serializable, and the shape parallax agent responses
already use. Every combinator also accepts plain values, treated as certain
(confidence 1.0).

## Prism → TypeScript mapping

| Prism | This library | Propagation rule |
|-------|--------------|------------------|
| `x ~> 0.9` | `cf(x, 0.9)` | attach confidence |
| `<~ x` | `conf(x)` | extract confidence |
| `a ~~ b ~~ c` | `chain(a, b, c)` | min confidence, last value |
| `a ~?? b ~?? c` | `coalesce([a, b, c], threshold?)` | first ≥ threshold (default 0.5), else last |
| `a ~&& b` | `and(a, b)` | min confidence |
| `a ~\|\| b` | `or(a, b)` | max confidence |
| `a ~+ b` `~-` `~*` `~/` | `add/sub/mul/div(a, b)` | min confidence |
| `a ~== b` `~!=` `~>` `~>=` `~<` `~<=` | `eq/neq/gt/gte/lt/lte(a, b)` | min confidence |
| any n-ary op | `lift(fn)(a, b, …)` | min confidence |
| `a ~\|\|> b ~\|\|> c` | `best(a, b, c)` | highest confidence wins |
| `check ~@> action` | `gate(check, threshold, fn)` | passes at ≥ threshold, else `cf(undefined, 0)` |
| `obj ~. a ~. b` | `prop(obj, 'a.b')` | degrades per missing hop |
| `uncertain if { high/medium/low }` | `uncertain(x, { high, medium, low }, bounds?)` | band dispatch (0.8 / 0.5 defaults) |

## Aggregation (multi-agent results)

```ts
import {
  averageConfidence, // mean confidence of a result set
  average,           // mean value + mean confidence
  weightedAverage,   // confidence-weighted mean
  synthesize,        // most confident single result
  majorityVote,      // winner by value identity; confidence = agreement × group mean
  consensus,         // unanimous / majority / split classification
} from '@parallaxai/confidence';

const verdict = consensus(agentResults, { confidenceThreshold: 0.7 });
// verdict.value: { status, winner, agreement, averageConfidence, reached }
```

`majorityVote` and `consensus` fold disagreement into confidence: three
highly confident agents that all disagree produce a *low-confidence* result,
which is exactly what a router should see.

## Semantics notes

- Confidence is always clamped to `[0, 1]`; `NaN` clamps to 0.
- `and`/`or` use JS truthiness for the value and Prism's min/max rule for
  the confidence.
- `gate` failure yields `cf(undefined, 0)` so a following `coalesce` falls
  through — replicating Prism's `check ~@> action ~?? fallback` idiom.
- `prop` never throws; once a hop is missing the value is `undefined` and
  confidence multiplies by `missingPenalty` (default 0.5) per unreached hop.
- `uncertain` band bounds are inclusive (`0.8` routes to `high`).
