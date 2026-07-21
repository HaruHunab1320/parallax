# Run log: the rematch — passing tests cannot outvote the reviewer

**Date:** 2026-07-21
**Companion to:** [2026-07-20-self-tests-pass-scope-shrinks.md](./2026-07-20-self-tests-pass-scope-shrinks.md)
**Execution:** `247b2c6f-5bb9` · completed · 801s · **confidence 0.69**
**What changed since the companion run:** the `agent` oracle (tier 3)
landed (commit `960c38f`) and both engineer roles now carry
`verify: [command, agent]` — after `node --test`, the architect reviews
the delivery against the original task and its structured verdict
(`VERDICT: approve|revise|reject` + `CONFIDENCE:`) min-combines with the
test result. Also: sends to a shared execution unit are serialized and
parallel assigns distribute across instances (commit `2456c00`).

Same task, verbatim, as the companion run (event journal: ring buffer,
eviction, compact(), cursor-safe replay from evicted ranges).

## What happened

Three journal rows tell the whole story:

```
engineer_a: escalate at 0.25 (command+agent)
engineer_b: accept   at 0.92 (command+agent)
architect:  review_verdict at 0.90 (review)
```

- **engineer_a** passed its own tests (`node --test` — 100%), but the
  architect's mid-workflow review said **revise (0.25)**. min-combine let
  the reviewer override the green suite: 0.25 < `escalateBelow` (0.4) →
  **live escalation to the architect**, who reviewed the work and
  produced the corrected final result for subtask-1. The event's detail
  field carries both signals side by side:
  `` `node --test` — partial (100%)`` + `agent review (architect): revise (0.25)`.
- **engineer_b** passed both tiers: tests green *and* the architect
  approved at 0.92 → accepted. Differential verdicts within one run —
  the policy is discriminating, not blanket-strict.
- The final **review step** emitted its own signal
  (`review_verdict · approve · 0.9 · source: review`).
- Execution confidence: **0.69** — the mean of what actually happened
  (0.25, 0.92, 0.90). Compare the companion run's misleading 100%.

## The controlled comparison

Same task, same pattern topology, same worker model; the only variable is
the verification tier:

| | 2026-07-20 (tier 1 only) | 2026-07-21 (tier 1 + 3) |
|---|---|---|
| `evict\|compact\|maxSize\|boundary` refs in deliverables | **0** | **112** |
| Skipped tests | 1 (the masking integration test) | **0** |
| Independent test re-run | 28 pass (of the narrowed scope) | **48 pass, 0 fail, 0 skipped** |
| Scope | hard 40% silently dropped, halves didn't compose | requirements present |
| Escalations | 0 | **1 (live, corrective)** |
| Reported confidence | 1.0 (honest metric, wrong contract) | **0.69 (honest, right contract)** |
| Reviewer's judgment | prose, invisible to the pipeline | **the signal** |

Two mechanisms plausibly drove the scope surviving this time: the
escalation *corrected* engineer_a's weak half after the fact, and — worth
noting for honesty — the engineers' objectives were unchanged, so any
behavioral difference is run-to-run variance plus the correction, not
prompt changes. The measurable, attributable difference is in the
**platform's behavior**: last time a scope cut sailed through at 100%;
this time a weak delivery was caught, escalated, and corrected inside the
workflow, and the final number reflects the friction.

## Cost of tier 3

Total runtime 801s vs 550–735s for tier-1-only runs of this task — one
reviewer turn per engineer verification (serialized through the singleton
architect) plus the escalation turn. Roughly +20–45% wall clock for
verification that catches what self-authored tests structurally cannot.
That is the triage economics working as designed: spend reviewer
attention exactly where the cheap tier is blind.

## Still open (from the companion's implications)

- `checklist` acceptance oracle (tier 2) — structural "done means X"
  derived from the task.
- Skipped-test discounting in the command oracle's scoring.
- Explicit de-scoping surfacing in completion protocols.
- Environment hygiene: the reviewer's verdict detail still carries host
  claude-mem hook noise; threads-page SSE regression still unchased.

## One-line summary

**Same task, one new tier: 0 → 112 requirement references, 1 → 0 skipped
tests, a live corrective escalation, and 100% → 0.69 — the number got
smaller because it started telling the truth.**
