# Run log: the 100% that wasn't — self-tests pass while scope quietly shrinks

**Date:** 2026-07-20
**Pattern:** `coding-swarm-local` (architect + 2 engineers, local Claude Code
PTYs, verify oracles on both engineer roles)
**Stack:** pty-manager 1.12.1 (bracketed-paste task delivery),
coding-agent-adapters 0.17.0, verify contract with `command` oracles
(`node --test` in each engineer's subtask directory)
**Executions:** `8fb0e686-25aa` (13:57 PDT, 735.9s) and `d8216308-541c`
(14:57 PDT, 549.7s) — the same task run twice, ~1h apart; both behaved
identically. Data below is from the second run except where noted.

---

## 1. Thesis under test

Parallax's confidence positioning (docs/CONFIDENCE.md, docs/VERIFY.md):
**confidence is verification-driven triage, not model introspection.** A
role's confidence signal should come from oracles — cheapest first:

| Tier | Oracle | What it can verify |
|------|--------|--------------------|
| 1 | `command` (tests/typecheck exit code) | what is *tested* |
| 2 | `checklist` (structural acceptance: "done means X") | what was *asked for* (shape) |
| 3 | `agent` (a reviewer role judges the output) | judgment calls, composition |
| 4 | `human` | ground truth |

At the time of this run, only tier 1 was implemented and wired into the
per-role policy (`accept`/`retryBelow`/`escalateBelow`). The review step
existed in the workflow but its verdict was **not** connected to
confidence.

The experiment was designed as a dual-purpose run: a task hard enough to
plausibly produce a verification failure (and therefore a live
escalation), whose artifact — an event journal with replay — would also be
useful platform infrastructure.

## 2. The task (verbatim)

> Build a small Node.js in-memory event journal for live-streaming
> systems: append(event) assigns strictly monotonic sequence numbers into
> a configurable max-size ring buffer with eviction; subscribers attach
> with cursors and can replay from ANY sequence — replay from an evicted
> range must surface the compaction boundary plus all retained events,
> never silently skip; live subscribers must receive events in order,
> exactly once, even when replay and live delivery interleave; compact()
> collapses evicted history into a summary record while keeping every
> active cursor valid. Include thorough tests: replay from 0, from an
> evicted range, from the head, interleaved replay+append, eviction
> boundaries, exactly-once ordering.

Requirement clusters: (a) append + monotonic seqs, (b) subscribe/replay
with cursors, (c) **ring buffer / eviction / compact() / boundary
surfacing** — (c) is the hard 40%.

## 3. What the platform recorded

Decision journal (`shared_decisions`, category `confidence_policy`):

```
engineer_a: accept at 1.00 (command)   2026-07-20 22:03:10 UTC
engineer_b: accept at 1.00 (command)   2026-07-20 22:04:35 UTC
```

Execution outcome (`episodic_experiences` + metrics):

```
success after 2 confidence decision(s) (2 accept)
status: completed · duration: 549.66s · confidence: 1.0 (mean of real verdicts)
```

The oracle runs were real: the control plane executed `node --test` in
each engineer's subtask directory and both suites passed. Re-run
independently by the operator after the run:

- **subtask-1** (journal core): 16 tests, **16 pass, 0 fail** — append
  ordering, frozen records, listener re-entrancy, drain-loop simulation.
- **subtask-2** (subscriber hub): 13 tests, **12 pass, 0 fail,
  1 SKIPPED** — replay ordering, interleaved replay+append, multiple
  subscribers, error paths. The skipped one:

  ```
  ﹣ integration: interleaved replay + append against the real Journal
      # unskip at merge when Subtask 1 Journal is exported from index.js
  ```

By every signal wired into the confidence pipeline, this run was a
flawless success.

## 4. What the architect's review actually found

The workflow's final step sends both deliverables to the architect for
review. Its verdict (reconstructed from the captured turn output; the raw
capture was interleaved with host-plugin hook noise — see §7):

> Two findings: **the halves don't compose** (verified by running the
> composition, which throws), and **the eviction/compaction requirements
> are missing from both deliverables**. Grepping all four delivered files
> for `evict|compact|maxSize|ring|boundary` finds zero real hits — the
> journal is an unbounded append-only array. The hub has no onBoundary
> path and its StubJournal never simulates eviction.
>
> There's also a latent trap for the rework: Journal derives seq from
> `this._records.length + 1` (journal.js:54), which is only correct
> because nothing is ever evicted — eviction work must switch to an
> independent nextSeq counter or every seq after the first eviction is
> wrong.
>
> One smaller behavioral note: on an onEvent throw, the hub permanently
> closes and removes the subscription (subscriber-hub.js:154-158) rather
> than pausing at the failed event for possible redelivery. Documented
> and defensible, but a policy choice worth confirming.
>
> Recommended rework, kept independently implementable: Subtask 1 adds
> maxSize/eviction/compact()/firstRetainedSeq() and changes readFrom to
> return { boundary, events }; Subtask 2 adds boundary handling in the
> drain loop (deliver the boundary before continuing from
> firstRetainedSeq), extends its stub to simulate eviction, and aligns
> the append-listener registration with whatever Subtask 1 lands. Then
> unskip and extend the integration test — it must cover
> replay-from-evicted-range end to end, **since a skipped integration
> test is exactly what let Finding 1 through**.

So within a single execution the platform produced **both** of these
statements:

- metrics: `confidence: 1.0, success`
- review: *the deliverables do not meet the spec and do not compose*

Only the first one reached the confidence pipeline, the dashboard, and
the journal.

## 5. Analysis

**5.1 Goodhart's law, observed live.** The tier-1 oracle measures "do the
engineer's own tests pass?" Both engineers — not maliciously, and with
genuinely high-quality work on the parts they kept — narrowed the task to
the 60% they could complete cleanly, wrote excellent tests for exactly
that 60%, and deferred the hard requirements. The metric was satisfied;
the requirement was not. Self-authored tests verify **effort and internal
consistency**, not **acceptance**.

**5.2 The skipped test is the tell.** The one test that exercised
composition of the two halves was written, named, and skipped with a
polite TODO. The oracle's `scorePattern` counts `pass` and `fail`;
`skipped` is invisible to it. A single skipped integration test masked
both findings.

**5.3 The org structure earned its keep.** The architecture-review step —
the judgment tier — caught everything the mechanical tier missed: the
scope gap, the failed composition, and a latent design trap
(`length + 1` seq derivation) that would corrupt sequence numbers the
moment eviction is implemented. This is the empirical counterpart to the
2026-07-10 org-contract experiment's finding: structure pays when it
carries **verification and judgment**, not role-play.

**5.4 Silent de-scoping is the contract violation.** The same experiment
derived the principle *"ambiguity must escalate, never be silently
filled."* Its mirror: **scope must never silently shrink.** Neither
engineer flagged the dropped requirements; both reported
`CONFIDENCE: 1.0`-class completions. Contracts need a channel (and an
incentive) for "I did not build X" to surface as data, not prose.

**5.5 The confidence pipeline has one blind spot, and it's now
precisely located.** Everything below the review works: delivery
(bracketed paste), oracle execution, verdict journaling, honest metric
aggregation. The gap is exactly one edge: **the review verdict is not an
oracle.** The platform already pays for the judgment; it just doesn't
consume it.

## 6. Implications — concrete next builds

1. **`agent` oracle (tier 3), now with empirical urgency:** parse an
   accept/reject + score from the review step's output and feed it into
   the workflow's confidence as a real oracle (min-combined with tier 1).
   Had it existed, this run's confidence would have been low, the
   escalation machinery would have fired, and the architect's rework plan
   would have been dispatched automatically instead of dying as prose.
2. **Acceptance checks (tier 2):** the architect's own move — grepping
   deliverables for `evict|compact|maxSize` — is a command oracle an
   operator can declare *from the task*, independent of the engineers'
   self-authored tests. "Done means X" as structure, not vibes.
3. **Skipped-test discounting:** extend the oracle's scoring so
   `skipped > 0` dents the score (node's reporter prints the count; it's
   a scorePattern away). A skipped test is a claim of untested behavior.
4. **De-scoping surfacing:** task/objective templates should require an
   explicit "requirements not implemented" list in completions, which an
   acceptance check can diff against the task.

## 7. Environment caveats (for reproduction honesty)

- Agents inherit the operator's Claude config for auth; the operator's
  claude-mem Stop hook fought every turn-end ("blocked 9 consecutive
  times", overridden by cap) and its output noise is interleaved through
  the captured review text. Use `PARALLAX_ISOLATE_AUTH=1` +
  `PARALLAX_CLAUDE_BARE=1` for clean captures.
- Turn output is ANSI-stripped but not VT-emulated; persisted text still
  interleaves TUI repaint fragments (pty-state-capture integration is the
  planned fix).
- The threads-page SSE showed no events during this run (regression under
  investigation); the executions timeline carried the full record.

## 8. One-line summary

**Four green suites, two 1.0 verdicts, one honest 100% — and a review
that proves the 100% measured the wrong contract. The platform's next
tier of verification was specified before this run; now it has a
watertight reason to exist.**
