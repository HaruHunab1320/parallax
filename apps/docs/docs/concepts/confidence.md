---
sidebar_position: 4
title: Confidence as Triage
---

# Confidence as Triage

Parallax treats confidence as a **routing decision**, not a calibrated probability that an agent is correct. The orchestrator does not try to know when an agent is *right* — it tries to know when it *can't be sure*, and routes accordingly.

**One line:** your swarm knows when to ask for help. Failing *safely* (surface to a human) beats failing *silently* (an agent claims done and nobody checks).

## Why not calibrated correctness?

The tempting pitch is "Parallax extracts a calibrated probability that each agent's output is correct." Parallax deliberately does **not** build on this, because it is genuinely hard and partly unsolved:

- Most LLM providers don't expose logprobs, and token probability measures *fluency*, not *correctness* — models hallucinate confidently.
- Verbalized confidence ("I'm 90% sure") correlates weakly with correctness. A self-reported `CONFIDENCE: 0.9` marker is the weakest version of this.
- Rigorous ML approaches (evidential/Bayesian methods, conformal prediction) need training-time access or a labeled calibration set. Parallax orchestrates *closed CLI agents* — that door is closed.

So instead of introspection, confidence in Parallax is grounded in **verification against reality**.

## The reframe: attention allocation

An orchestrator does not need a probability. It needs to decide: *accept this, or get it checked?* A good system spends its scarce resources well:

1. **Auto-verify** where an oracle is cheap.
2. **Spend a second agent** where that's worth the cost.
3. **Spend a human's attention** only where nothing else can resolve it.

Confidence is the signal that decides which branch a result takes. Its job is to distinguish "checkable and fine" from "I can't be sure" — not to be right about correctness.

## The tiers

For any task, confidence is resolved by the first tier that applies:

| Tier | Signal | Trust | Cost |
|------|--------|-------|------|
| **Cheap oracle** | Compiler / typecheck / tests pass, schema & constraint checks | high | ~free (already run) |
| **Structural acceptance check** | "Done means X" turned into a lightweight per-task checklist — confirms shape, not truth | medium | cheap |
| **Second agent** | A reviewer / cross-checker when structural checks aren't enough | medium-high | one agent turn |
| **Human** | The universal fallback when no automated oracle exists | highest | expensive |

The introspection signals (self-report markers, consistency sampling, linguistic hedging) are **optional supplements**, never the default.

This is why **coding is the beachhead**: it has the richest, cheapest oracles of any agent domain (compile, typecheck, tests, diff/scope sanity).

## The escalation policy

Org-chart patterns declare a per-role escalation policy that consumes these signals. Each role can specify:

- **`accept`** — the result is good enough; move on.
- **`retryBelow`** — below this confidence, retry the task (optionally with more guidance).
- **`escalateBelow`** — below this confidence, escalate to the role's `reportsTo` (the agent tier) and, ultimately, to a human.

The policy is fed by verification results — test outcomes, typecheck, acceptance checks — with `reportsTo` as the agent tier and human-surface as the terminal. An engineer whose *tests fail* escalates to the architect. That needs no ML magic to be obviously correct.

## The confidence library

The `@parallaxai/confidence` library provides the algebra that carries these values through a pattern:

- **`Confident<T>`** — a value paired with its confidence and provenance.
- **Combinators** — `cf`, `best`, `gate`, `uncertain`, `coalesce` — for selecting, thresholding, and combining confident values.
- **Aggregation** — combining multiple confident results (e.g. across a role's instances) into one.

## What this is NOT

- **Not** a promise to verify open-world truth. Parallax verifies where oracles are cheap, structurally-checks where it can, and escalates the rest.
- **Not** a claim that the swarm is always right. The claim is that the swarm **knows when to ask for help.**
- **Not** a fix for hard tasks. Confidence lets you fail *safely*; it doesn't make real-world tool access or ambiguous-failure recovery easy.

## Learn more

- [Confidence Scoring](/docs/concepts/confidence-scoring) — how scores flow through aggregation
- [Consensus](/docs/concepts/consensus) — combining multiple agent opinions
- [Verification Patterns](/docs/patterns/verification-patterns) — building verify steps into org-chart workflows

For the full internal positioning, see `docs/CONFIDENCE.md` and `docs/VERIFY.md` in the repository.
