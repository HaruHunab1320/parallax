# Confidence as triage, not omniscience

**Status:** Positioning — 2026-07-09
**One line:** Parallax does not try to know when an agent is *right*. It tries
to know when it *can't be sure*, and routes accordingly.

This doc exists because "confidence" is easy to frame as a problem that can't
be solved, and just as easy to solve if you frame it correctly. It records
which framing we're building on, so we don't drift back into the trap.

---

## The trap: confidence as calibrated correctness

The tempting pitch is "parallax extracts a calibrated probability that each
agent's output is correct." Don't build on this. It's genuinely hard and
partly unsolved:

- Most LLM providers don't expose logprobs, and where they do, token
  probability measures *fluency*, not *correctness* — models hallucinate
  confidently. RLHF makes this worse by training models to sound sure.
- Verbalized confidence ("I'm 90% sure") correlates weakly with correctness.
  A self-reported `CONFIDENCE: 0.9` marker is the weakest version of this.
- Self-consistency (sample N×, measure agreement) is better-validated but
  expensive, and works mainly for short verifiable answers, not open-ended
  work.
- The rigorous ML approaches (evidential/Bayesian nets, conformal
  prediction) need training-time access or a labeled calibration set.
  Parallax orchestrates *closed CLI agents* — that door is closed.

If the platform's value depends on calibrated LLM introspection, the
platform's value is built on sand. So it doesn't.

## The reframe: confidence as attention allocation

An orchestrator does not need a probability. It needs a routing decision:
*accept this, or get it checked?* The valuable system spends its scarce
resources well:

1. **auto-verify** where an oracle is cheap,
2. **spend a second agent** where that's worth the cost,
3. **spend a human's attention** only where nothing else could resolve it.

Confidence is the signal that decides which branch a result takes. Its job
is to distinguish "checkable and fine" from "I can't be sure" — not to be
right about correctness. Failing **safely** (surface to a human) beats
failing **silently** (agent claims done, nobody checks). That is the entire
product value, and it needs no unsolved ML.

## Why verification, not introspection, is the signal

Confidence should be grounded in **verification against reality**, not the
model reflecting on itself. Verification is cheap exactly where the domain
has cheap oracles — and expensive-to-impossible where it doesn't. That
asymmetry is a property of the world, not a parallax limitation, and it's
the reason **coding is the right beachhead**: it has the richest, cheapest
oracles of any agent domain.

| Signal source | Trust | Cost | Availability |
|---------------|-------|------|--------------|
| Compiler / typecheck / tests pass | high | ~free (already run) | coding |
| Reviewer agent verdict | medium-high | one agent turn | broad |
| Structural acceptance check (see below) | medium | cheap | broad |
| Diff / scope sanity | medium | ~free | coding |
| Self-report `CONFIDENCE:` marker | low | free | any (opt-in) |
| Consistency sampling (N×) | medium | N× spend | any (opt-in) |

The introspection signals (self-report, consistency, linguistic hedging)
are **optional supplements**, never the default and never the pitch.

## The tiers — what the escalation policy consumes

For any task, confidence is resolved by the first tier that applies:

1. **Cheap oracle** — tests, compile, schema/constraint checks. Best signal;
   use wherever it exists.
2. **Structural acceptance check** — a well-formed task carries "done means
   X". An orchestrator can turn that spec into a lightweight per-task
   checklist automatically (no hand-coded verifier per domain). Catches the
   common failure — *agent claims done, artifact missing or malformed* —
   across arbitrary domains. **Ceiling: it verifies shape, not truth.** It
   confirms a confirmation number was produced; it can't confirm the ticket
   actually booked without a real oracle.
3. **Second agent** — a reviewer/cross-checker when structural checks aren't
   enough and the cost is justified.
4. **Human** — the universal fallback. When no automated oracle exists and
   confidence is low, escalate. This is the design working, not failing.

The org-chart escalation policy (`accept` / `retryBelow` / `escalateBelow`
per role) is the mechanism. What changes from today: it should be fed by
tier 1–2 signals (test results, acceptance checks), with `reportsTo` as the
agent tier and human-surface as the terminal — **not** by a self-reported
number.

## What this is NOT

- Not a promise to verify open-world truth. Nobody can. We verify where
  oracles are cheap, structurally-check where we can, and escalate the rest.
- Not a claim that the swarm is always right. The claim is that **the swarm
  knows when to ask for help.** That honesty is the selling point; pretending
  to omniscience would destroy it.
- Not a fix for hard tasks. Confidence lets you fail *safely*; it doesn't
  make real-world tool access or ambiguous-failure recovery easy. Keep that
  distinction crisp in positioning so we don't overpromise.

## Positioning implications

- **The product is orchestration** — org-chart teams of real CLI coding
  agents across local/Docker/K8s/edge hardware. Lead with this; it stands on
  its own.
- **Confidence is a feature of it: verification-driven triage.** Market it as
  "your swarm knows when to escalate," not "your swarm is always right."
- **Coding is the beachhead** *because* its oracles are cheap. Don't lead
  with, or promise, general open-world verification.

## Code implications

- The **confidence algebra** (`Confident<T>`, `best`/`gate`/`uncertain`/
  `coalesce`, the policy combinators) moves to the standalone prism-ts
  confidence library — that's its natural home. Parallax consumes it.
  `@parallaxai/confidence` becomes redundant once that lands.
- **Extraction** (structured parsing, linguistic analysis, consistency)
  already lives in prism-ts's confidence package; parallax's crude
  `parseConfidenceMarker` is a weak subset and should defer to it — but only
  as a tier-5 supplement.
- The **higher-value wiring in parallax is verification**: feed the
  escalation policy from the org-chart `review`/verify steps (tests,
  typecheck, acceptance checks) rather than a self-reported marker. That is a
  smaller, more honest, more reliable build than scraping confidence out of
  agent prose — and it makes the escalation demo real: an engineer whose
  *tests fail* escalates to the architect, which needs no ML magic to be
  obviously correct.

---

**Next concrete decision:** define the `verify` step contract in org-chart
YAML — how a role declares its oracle (test command, typecheck, acceptance
checklist) and how its pass/fail/partial result becomes the `Confident`
value the escalation policy routes on.
