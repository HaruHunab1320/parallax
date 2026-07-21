# The `verify` contract — verification-driven confidence

**Status:** `command` (2026-07-09), `history` (2026-07-10), and `agent`
(2026-07-20) oracles + role-level `verify` are wired into the workflow
executor and tested; the `review` step also surfaces its verdict as a
confidence signal. The `checklist` / `human` oracles and the `verify`
*step* remain specified-but-unimplemented (noted inline).
**Depends on:** [docs/CONFIDENCE.md](CONFIDENCE.md) (confidence = verification
triage, not LLM introspection)
**Changes:** org-chart YAML schema (`OrgRole.verify`),
`workflow-executor` step completion.

This specifies how a role's output gets a **confidence signal from
verification** — a cheap oracle, a structural acceptance check, a second
agent, or a human — instead of a self-reported `CONFIDENCE:` number. The
signal feeds the existing per-role escalation policy
(`accept`/`retryBelow`/`escalateBelow`).

---

## 1. Why

Today the confidence policy consumes a number the agent *says* about itself
(`CONFIDENCE: 0.7` in its turn output). Per CONFIDENCE.md that's the weakest
possible signal. `verify` replaces it with signals grounded in reality,
ordered cheapest-first:

| Tier | Oracle | Trust | Cost |
|------|--------|-------|------|
| 1 | `command` — tests / typecheck / lint exit code | high | ~free |
| 2 | `checklist` — structural "done means X" criteria | medium | cheap |
| 3 | `agent` — a reviewer role judges the output | medium-high | one turn |
| 4 | `human` — surface for approval | ground truth | human time |

An agent's self-report is demoted to an optional tier-5 supplement.

There is also a `history` oracle — not verification of *this* output but a
prior from the decision journal (how past runs of this pattern went, and how
much retry/escalation friction this role generated). Like the self-report
it's a weak supplement: sparse history resolves neutral, and in an oracle
list the `min` combine keeps real verification dominant.

## 2. The contract

### 2.1 Role-level `verify` (the common case)

A role declares how its outputs are verified. After any `assign` to that
role completes, the executor runs the role's `verify` oracles, computes a
`Confident` value, and applies the role's `confidence` policy to it.

```yaml
roles:
  engineer:
    reportsTo: architect
    # How this role's work is verified → produces the confidence signal
    verify:
      - type: command
        run: "npm test && npm run typecheck"
        cwd: "${workspace.path}"
        # exit 0 → pass (1.0); non-zero → fail (0.0).
        # optional: parse a partial score from output (see 3.1)
        passConfidence: 1.0
        failConfidence: 0.0
    # What to DO with the signal (unchanged, from CONFIDENCE.md / C2)
    confidence:
      accept: 0.8         # tests pass → accept
      retryBelow: 0.6     # partial/flaky → retry once with the failures
      escalateBelow: 0.4  # broken → architect reviews and decides
```

Semantics: engineer finishes → `npm test && npm run typecheck` runs in the
workspace → pass ⇒ confidence 1.0 ⇒ `accept`; fail ⇒ 0.0 ⇒ below
`escalateBelow` ⇒ the failing output + logs escalate to `architect`. No
self-report, no ML.

### 2.2 Multiple oracles compose (tiers)

List several; they run in order and their confidences **combine with the
`@parallaxai/confidence` algebra** (default: `chain` = minimum — a result is
only as trustworthy as its weakest check). A later tier only runs if earlier
tiers didn't already resolve to a terminal band (configurable).

```yaml
verify:
  - type: command                 # tier 1: must compile + pass tests
    run: "npm test"
  - type: checklist               # tier 2: structural acceptance
    criteria:
      - "a test file was added or changed"
      - "the public API in the task was implemented"
  - type: agent                   # tier 3: reviewer sanity pass
    role: reviewer
combine: min        # min (default) | weighted | product
```

### 2.3 `verify` as an explicit step

For verification not tied to one role's completion (e.g. verify the merged
output of a `parallel` block), use a `verify` step. It attaches a confidence
to a prior step's result and routes via `onLow`.

```yaml
workflow:
  steps:
    - type: parallel
      steps:
        - { type: assign, role: engineer_a, task: "..." }
        - { type: assign, role: engineer_b, task: "..." }
    - type: verify
      subject: "${step_0_result}"
      oracle:
        type: command
        run: "npm test"
      onLow:               # what to do if confidence < threshold
        threshold: 0.6
        action: escalate   # escalate | retry | surface | fail
        to: architect
```

## 3. Oracle types

### 3.1 `command`

Runs a shell command; the exit code is the primary signal.

```yaml
type: command
run: "npm test"
cwd: "${workspace.path}"        # default: the role/thread workdir
timeoutMs: 120000
passConfidence: 1.0             # exit 0
failConfidence: 0.0            # non-zero
# Optional partial scoring: a regex whose first capture group is a 0..1 or
# a "passed/total" ratio, used INSTEAD of the binary pass/fail when present.
scorePattern: "(\\d+) passed, (\\d+) failed"   # → passed/(passed+failed)
```

Confidence: `scorePattern` ratio if matched, else `pass/failConfidence` by
exit code. This is the tier-1 cheap oracle — the strongest signal, free
because coding workflows run tests anyway.

### 3.2 `checklist`

Structural acceptance — "done means X". Each criterion is checked by a
sub-oracle (a `command`) or, when no command is given, by a **judge agent**
(cheap, focused: "does this output satisfy: <criterion>? yes/no"). Confidence
= fraction of criteria passing.

```yaml
type: checklist
criteria:
  - text: "a confirmation number is present in the result"
  - text: "the output is valid JSON matching the schema"
    run: "jq -e . < ${artifact}"      # optional command check
weighting: equal        # equal | firstFailZero
```

**Ceiling (per CONFIDENCE.md):** verifies *shape*, not *truth*. Confirms a
confirmation number exists; cannot confirm the ticket booked. Generalizes to
arbitrary domains precisely because it only checks structure.

### 3.3 `agent`

A second agent (a role, typically the reviewer or `reportsTo`) judges the
output and returns a verdict. The reviewer is instructed to end with a
structured verdict the executor parses into a confidence.

```yaml
type: agent
role: reviewer
rubric: "Is the implementation correct, complete, and tested?"
# reviewer returns e.g. {"verdict":"approve|revise|reject","confidence":0-1}
```

This is the tier-3 signal and the natural home for the reviewer role that
org charts already have.

### 3.4 `human`

Surfaces the output for human approval — the universal fallback. Emits a
`human_approval_requested` event; the workflow waits (or parks, per policy)
for a decision.

```yaml
type: human
prompt: "Approve booking ${step_0_result.confirmation}?"
timeoutMs: 0            # 0 = wait indefinitely (parked)
onTimeout: surface     # surface | reject
```

## 4. How it maps to the existing policy

`verify` produces a `Confident<result>`; the role's `confidence` policy
(from C2, unchanged) routes on it:

```
verify oracles → combine → Confident{ value: <agent output>, confidence: c }
        │
        ▼
role.confidence policy:
  c ≥ accept          → accept
  retryBelow ≤ c      → accept with warning
  escalateBelow ≤ c<retryBelow → retry once (with the failing check detail)
  c < escalateBelow   → escalate to reportsTo  (→ ... → human)
```

The retry critique now carries **what actually failed** (test output, the
unmet checklist items) instead of "you had low confidence" — a materially
better retry prompt.

## 5. Types (additions to org-patterns/types.ts)

```typescript
export type VerifyOracle =
  | { type: 'command'; run: string; cwd?: string; timeoutMs?: number;
      passConfidence?: number; failConfidence?: number; scorePattern?: string }
  | { type: 'checklist'; criteria: Array<{ text: string; run?: string }>;
      weighting?: 'equal' | 'firstFailZero' }
  | { type: 'agent'; role: string; rubric?: string }
  | { type: 'human'; prompt?: string; timeoutMs?: number;
      onTimeout?: 'surface' | 'reject' };

export interface OrgVerify {
  oracles: VerifyOracle[];              // 'verify:' accepts a single oracle or a list
  combine?: 'min' | 'weighted' | 'product';   // default 'min'
}

// OrgRole gains:  verify?: VerifyOracle | VerifyOracle[] | OrgVerify;

// New WorkflowStep variant:
//   | { type: 'verify'; subject: any; oracle: VerifyOracle | VerifyOracle[];
//       combine?: 'min'|'weighted'|'product';
//       onLow?: { threshold: number; action: 'escalate'|'retry'|'surface'|'fail'; to?: string } }
```

## 6. Executor implementation sketch

In `workflow-executor.ts`:

1. **Oracle runner** — `runVerify(oracles, ctx, subject): Promise<Confident>`.
   - `command`: spawn via the runtime's shell (reuse the thread's workdir /
     `git-workspace-service` path); map exit/scorePattern → confidence.
   - `checklist`: run each criterion's `run`, or dispatch a one-shot judge
     agent for text-only criteria; confidence = fraction passing.
   - `agent`: `getOrSpawnRoleUnit(role)` + `sendToExecutionUnit`, parse the
     verdict JSON → confidence.
   - `human`: emit `human_approval_requested`, await resolution (or park).
   - Combine with `chain`/`weightedAverage`/product from
     `@parallaxai/confidence`.
2. **Wire into `executeAssignStep`** — replace `extractConfidence(response)`
   (the self-report path) with: if the role has `verify`, run it and use its
   confidence; else fall back to the self-reported marker (tier-5 supplement).
   The rest of `applyConfidencePolicy` is unchanged.
3. **`verify` step** — new case in `executeStep`; runs the oracle on
   `subject`, applies `onLow`.
4. **Events** — extend `step_confidence` with `{ source: 'command'|
   'checklist'|'agent'|'human'|'selfreport', detail }` so the dashboard shows
   *why* (which test failed), not just the number.

## 7. Scope / non-goals

- No sandboxing design here — `command` oracles run with the same trust as
  the agent's own tool use (they already run arbitrary code). Revisit for
  untrusted patterns.
- `human` parking/resume persistence reuses the thread-persistence layer;
  detailed design deferred.
- Consistency-sampling and other introspection oracles are explicitly out of
  scope (optional, costly, tier-5) — see CONFIDENCE.md.

---

## 8. Implemented so far

- ✅ `command` oracle — exit code → confidence, optional `scorePattern`
  partial scoring, `cwd` (with `${...}` interpolation), timeout.
- ✅ `history` oracle — a prior from the decision journal
  (`shared_decisions` + `episodic_experiences`, written by
  `DecisionJournal`): age-decayed success rate of past runs of this
  pattern × the role's clean-decision rate, shrunk toward neutral on
  sparse history (a weak prior must never trigger retries/escalations by
  itself; that inverts decision-pathfinder's sample factor, whose
  low-confidence action is conservative rather than costly). Options:
  `halfLifeDays` (30), `minRuns` (3), `saturationRuns` (10), `maxRuns`
  (200). Resolves neutral without a wired store or on lookup failure.
  Best used in a list with a real oracle — `min` keeps verification
  dominant.
- ✅ `agent` oracle (tier 3) — a reviewer role (default `reportsTo`)
  judges the output against the original task; the executor parses
  `VERDICT: approve|revise|reject` + `CONFIDENCE:` into the signal
  (contradictory pairs clamp: a rejected result can never pass the accept
  threshold). Neutral-with-warning when no reviewer resolves, the reply
  is unparseable, or the review turn fails. Motivated empirically by
  docs/experiments/2026-07-20-self-tests-pass-scope-shrinks.md — the run
  where self-authored tests scored 1.0 while both engineers silently
  dropped the hard requirements and the (then-unwired) review caught it.
- ✅ The `review` *step* emits its parsed verdict as a `step_confidence`
  event (`action: review_verdict`, `source: review`) — journaled and
  counted into the execution's average confidence.
- ✅ Role-level `verify` (single oracle or list; list combines by `min`).
- ✅ Wired into `executeAssignStep`: `verify` confidence replaces the
  self-report and feeds the existing `accept`/`retryBelow`/`escalateBelow`
  policy (a role with `verify` but no explicit policy uses sensible
  defaults). The retry critique and escalation message carry the
  verification **detail** (what failed). `step_confidence` events gained a
  `source` (`command` / `selfreport` / …) and `detail`.
- ⬜ `checklist` / `agent` / `human` oracles, the `verify` *step*, and the
  `weighted` / `product` combine modes — specified above, not yet built
  (unimplemented oracle types log a warning and treat as pass).

This gives "engineer's tests fail → escalates to architect" end to end, with
zero ML and a signal you can trust.
