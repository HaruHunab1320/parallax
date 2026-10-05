# REPORT_PARALLAX — branch status, durability, oracle surface
Date: 2026-08-06 · `main` e3c98eb (2026-08-04) · working tree clean except untracked `patterns/gateway-dryrun.org.yaml`

---

## 1. Branch status · **REFUTED — the work is already merged and the "foreign commit" is safe**

- `feat/wave2-improvements` still **exists** at `3ff4cd6`, matching the expected head.
- It is **fully merged into `main`**: `git rev-list --count main..feat/wave2-improvements` = **0**.
  `git branch --merged main` lists it. `main` is 6 commits *ahead*; the merge-base **is**
  `3ff4cd6` itself.
- `feat/confidence-kernel-migration` (`71dacff`) is likewise 0 ahead of `main`.

**The c2f3e0e risk does not exist.** `c2f3e0e` ("chore: coding-swarm-agent picks up
tmux-manager 0.1.2 — bracketed-paste delivery", 2026-07-25) is contained in:
`feat/wave2-improvements`, **`main`, `origin/main`, and `origin/HEAD`**.

> **No cherry-pick is needed. Do not perform the "relocate to safety first" step** — it would
> create a duplicate commit. Both `feat/*` branches are safely deletable; `main` already
> carries everything.

Kernel dependency on `main`: `packages/control-plane/package.json:26` → `"@_89/confidence-kernel": "0.2.0"` (exact pin).

---

## 2. Legacy confidence · **BOTH still exist — but only one needs anything, and it is not migration**

Real package names are `@parallaxai/*`, not `@parallax/*`.

### `packages/confidence` → `@parallaxai/confidence` — **LIVE, and orthogonal to the kernel**
5 source files / 547 lines. Dependents (`workspace:*`): `packages/patterns`,
`packages/runtime-local`, `packages/sdk-typescript`, `packages/control-plane`.
Source imports across ~15 modules, e.g.
`patterns/src/patterns/uncertainty-router.ts:1`, `document-analysis.ts:1`, `voting.ts:1`,
`consensus-builder.ts:1`, `quality-gate.ts:1`, `load-balancer.ts:1`,
`control-plane/src/org-patterns/review-verdict.ts:1`, `workflow-executor.ts:11`.

Its exports (`cf`, `Confident<T>`, `best`, `uncertain`, `averageConfidence`,
`parseConfidenceMarker`, `majorityVote`) are a **confidence-carrying value algebra** —
a monad-ish wrapper over results. `@_89/confidence-kernel` is a **history scorer**
(decayed success × efficiency × saturation). Different abstractions at different layers;
`workflow-executor.ts` imports **both** (`:10` kernel `combine`, `:11` `@parallaxai/confidence`
`best`/`cf`) without conflict.

> **Migration estimate: none required.** These do not overlap. Recommend explicitly recording
> that `@parallaxai/confidence` is *not* superseded, to stop the question recurring.

### `packages/confidence-tracker` → `@parallaxai/confidence-tracker` — **DEAD**
5 files / 1087 lines. **Zero dependents**: no `package.json` in the repo depends on it, and no
source file outside the package imports it. Only self-references
(`src/index.ts:2,8`, `src/confidence-tracker.ts:28` — all doc comments).

> **Estimate: delete.** ~1 hour including the stale `packages/data-plane/dist/confidence-tracker/*`
> build artifacts. Not a migration.

---

## 3. Durability gaps · **BOTH CONFIRMED — all gateway state is process memory**

`packages/control-plane/src/grpc/services/gateway-service.ts` (793 lines):

| line | state | durability |
|---|---|---|
| `:45` | `private connectedAgents: Map<string, GatewayAgentSession> = new Map()` | in-memory |
| `:46` | `private pendingRequests: Map<string, PendingRequest> = new Map()` | in-memory |
| `:47-48` | `private threadEventListeners: Map<string, Set<(event:any)=>void>> = new Map()` | in-memory |
| `:26` | `activeThreads: Map<string, {executionId, status}>` (per session) | in-memory |
| `:169` | `activeThreads: new Map()` — created on connect | rebuilt only from a live stream |

**(a) Gateway threads do not survive control-plane restart · CONFIRMED.** A thread's identity
lives in `session.activeThreads`, set at `:447` on `ThreadSpawnResult`. That Map is inside a
`GatewayAgentSession` inside `connectedAgents` — all three tiers are process memory. Restart
drops every thread record; nothing reads them back from a store.

**(b) thread→session mapping orphans on reboot · CONFIRMED.** The mapping *is*
`session.activeThreads` — there is no separate index and no persistence. It is reconstructed
only when an agent re-establishes its gRPC stream. Threads whose agent does not reconnect are
unreachable and invisible; `pendingRequests` (`:46`) resolve never.

Note `handleThreadSpawnResult` (`:445-447`) matches by `pending.taskId === result.thread_id`
with a comment acknowledging the indirection — a second reason the mapping is fragile.

### What persisting these as lifecycle events would require

The emission points already exist and are single — this is additive, not a redesign:
- `connected` → `:169` (session construction)
- `spawned` / `adopted` → `:447`
- `status change` → `handleThreadStatusUpdate` (`:101`)
- `disconnected` / `orphaned` → session teardown + a `pendingRequests` sweep

Needed: (i) a durable append target, (ii) a fold that rebuilds `connectedAgents` /
`activeThreads` on boot, (iii) an `orphaned` emission on the timeout path (does not exist —
today there is no timeout sweep, which is the actual bug behind (b)). **Estimate: moderate**;
the emission seam is clean, the boot-time fold is the real work.

---

## 4. Oracle surface · inventory + standalone-invocability

`packages/control-plane/src/org-patterns/types.ts:95`:
`export type VerifyOracle = CommandOracle | AgentOracle | HistoryOracle` — a **closed union of 3**.
(`checklist` / `human` are specified in `docs/VERIFY.md` but not in the type — `types.ts:92-93`.)

| oracle | input | output | standalone on an arbitrary external claim? |
|---|---|---|---|
| **`command`** (`workflow-executor.ts:869-923`) | `{run, cwd?, timeoutMs?=120000, passConfidence?=1.0, failConfidence?=0.0, scorePattern?}` (`types.ts:114-125`) | `{confidence, detail}`; exit 0 → pass; `scorePattern` regex with 2 groups → `passed/(passed+failed)` partial score (`:879-887`); stdout/stderr tail 800 chars | **YES — trivially.** Only touches `context` for `resolveVariables` on `cwd` (`:870-872`). Lift as a free function taking `(spec, cwd)`. This is the reusable eval verdict primitive. |
| **`agent`** (`runAgentOracle`, `:947`) | `{role?, rubric?}` (`types.ts:106-112`); reviewer defaults to `role.reportsTo` | parses `VERDICT: approve\|revise\|reject` + a CONFIDENCE marker | **Partly.** Needs an `OrgRole` and the executor's agent-dispatch. Reusable only if a synthetic single-role org is constructed. The *parser* (`review-verdict.ts`, `parseConfidenceMarker`) is independently reusable. |
| **`history`** (`runHistoryOracle`, `:1031-1038`) | `HistoryOracle` + `role` + context; requires `this.decisionHistory` | `{confidence, detail}`; warns and returns neutral when absent (`:1036-1038`) | **No, as-is** — bound to `DecisionHistory` and role identity. But `scoreDecisionHistory` (`decision-history.ts:111`) is an exported pure function and *is* standalone. |

### Two defects found in the combine path

1. **`spec.combine` is declared and silently ignored.** `types.ts:198-199` declares
   `combine?: 'min' | 'weighted' | 'product'` (default `'min'`). `runVerify` hardcodes
   `combine(results, 'min')` at `:843` and never reads `spec.combine`. A pattern author
   setting `combine: 'weighted'` gets `min` with no warning. **Real bug.**
2. **Unknown oracle types return `confidence: 1.0` (pass).** `:925-932` logs
   "Verify oracle type not implemented — treating as pass" and returns `{confidence: 1.0}`.
   The closed union makes this unreachable from TypeScript, but org patterns are loaded from
   **YAML** (`patterns/*.org.yaml`), so an untyped/typo'd oracle reaches it and **silently
   passes**. For reuse as eval verdict machinery this default is backwards — it should be
   neutral or an error. Severity: PLAUSIBLE (depends on YAML validation, not audited here).

---

## 5. Event emission · one clean seam, already single

`runVerify` (`:820-851`) is the single funnel for every verdict: all oracles run through
`Promise.all(spec.oracles.map(o => this.runOracle(...)))` at `:836` and combine at `:843`.
Its return `{confidence, source, detail}` (`:845-850`) already carries everything an
observation record needs except identity and time.

Emitting `{agent, t, assertion, confidence, basis}` requires one insertion at `:845`:
- `agent` ← `role.id` (in scope)
- `confidence` ← `combined.confidence`
- `basis` ← `spec.oracles.map(o => o.type).join('+')` — already computed as `source` (`:846`).
  Maps directly to the requested `exit-code | self-report` distinction: `command` = exit-code,
  `agent` = self-report, `history` = prior.
- `t` ← injected clock (none today).

Per-oracle records (finer grain) would go at `runOracle`'s return sites. Also note the
accept/warn decision at `:795-808` already emits a structured `{action, source}` — a second,
coarser candidate.

**Heartbeats through the existing gateway channel: YES, cheaply.** The bidirectional stream
already carries `thread_status_update` (`:98-101`) and `thread_event` (`:95-96`) with
handlers in place. A periodic no-op `thread_status_update` needs no new protocol, no new
connection, and reuses `handleThreadStatusUpdate`. This is the cheapest heartbeat surface
across all the repos surveyed.

---

## 6. Decision trees · **REFUTED — parallax has no decision-tree system**

`grep -rl 'DecisionTree\|decision-tree' packages/*/src` → **no matches**. The premise
conflates two repos: the decision **tree** lives in `decision-pathfinder`
(`IDecisionTree`, `TreeEvolution`); parallax has decision **history**.

What parallax actually has: `packages/control-plane/src/org-patterns/decision-history.ts`
(390 lines) — `DecisionHistory` class (`:241`), `scoreDecisionHistory` (`:111`),
`patternFamily` (`:79`). Post-migration it imports `ageDecayWeight`, `detectDrift`, `pool`,
`scoreHistory`, `HistoryRun` from the kernel (`:1-7`) and defines its own `HistoryOracle`
type locally (`:9`). It is a **flat per-pattern run scorer**, not a tree — there is no node,
edge, or path structure anywhere in it.

---

## Dropped claims
- "feat/wave2-improvements still exists unmerged" — merged, 0 ahead.
- "c2f3e0e is ONLY on that branch" — it is on `main` and `origin/main`; the recommended
  cherry-pick would duplicate it.
- "packages/confidence … estimate migration" — not a migration target; orthogonal abstraction.
- "the current decision-tree system in this repo" — there is none.
- Oracle line numbers `816-852` / `runHistoryOracle ~1026` — actual `820-851` / `1031`.
