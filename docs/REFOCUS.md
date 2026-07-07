# Parallax Refocus Plan

**Status:** Proposal — 2026-07-06
**Scope:** Remove the Prism DSL, cut dead weight, and narrow the product to what
parallax is uniquely good at: orchestrating swarms of real CLI coding agents
across any hardware, with confidence as a routing/escalation signal.

---

## 1. The vision, restated

**Parallax is the orchestration platform for coding-agent swarms.** You define
an agent team as an org chart in YAML; parallax spawns real CLI agents (Claude
Code, Codex, Gemini, Aider) into that structure — in local PTYs, Docker
containers, Kubernetes pods, or on remote devices behind NAT via the gateway —
routes work through the hierarchy, and uses per-response confidence to decide
when to accept, retry, escalate to a supervisor, or surface to a human.

Two open-source gravity wells feed the platform:

1. **The PTY/adapter stack** (already extracted: `pty-manager`,
   `coding-agent-adapters`, `pty-console`, `pty-state-capture`, etc.) — the
   best infrastructure for programmatically driving CLI coding agents.
2. **`@parallaxai/confidence`** (new, built in Workstream A) — a small
   TypeScript library for confidence-carrying values and uncertainty-aware
   control flow, usable inside any framework, not just parallax.

What parallax is **not**: a general-purpose workflow engine, a language
project, or an enterprise platform ahead of its users.

### Principles

- **Authoring surfaces must be languages LLMs and humans already know:**
  TypeScript for logic, YAML for topology. No custom syntax.
- **Every package in the repo must either serve the product or be a published,
  maintained library.** No READMEs promising code that doesn't exist.
- **Polyglot participation is a protocol claim, not an SDK commitment.** The
  gateway gRPC contract is the interface; small per-language *examples* prove
  it. Maintained SDKs: TypeScript and Python only.
- **Confidence must do work.** Anywhere it's only logged, either wire it into
  a decision (routing, caching, escalation) or stop claiming it.

---

## 2. Why Prism goes

Not a judgment on the language design — the confidence algebra is genuinely
good. It goes because of what it costs relative to how it's actually used:

- **It's a second full-time project.** `@prism-lang/{core,validator,
  confidence,llm,cli}` is ~25–40k LOC of parser/interpreter/tooling maintained
  outside this repo, by the same one person building the platform.
- **The integration is fighting it.** `packages/control-plane/src/
  runtime-manager/runtime-manager.ts:52-138` serializes JS objects into Prism
  *source text*, escaping quotes and renaming `agents` → `agentList` because
  `agents` is a Prism reserved word — a hack that leaks into every pattern
  file. `runtime-manager.ts:156-195` reverse-engineers `ConfidenceValue` /
  `ObjectValue` wrappers back into JS, including recursive unwrapping of
  confidences-of-confidences. `packages/pattern-sdk/test/` contains ~20
  `learn-prism*.ts` / `debug-*.ts` scripts — a year of debugging the language
  instead of the product.
- **The codebase already moved on.** The org-chart path
  (`packages/control-plane/src/org-patterns/`) — the one the coding-swarm
  work actually uses — has its own compiler and `workflow-executor.ts` and
  never touches Prism. Prism only powers the legacy pattern path.
- **LLMs can't write it.** There's no training corpus for 18 sigil operators.
  In 2026 an orchestration language that coding agents can't author is a
  liability for an agent platform. Every model writes fluent TypeScript.
- **Users won't learn it.** A DSL is a wall in front of the first demo.

What must survive the removal: the **confidence propagation semantics**
(min-through-chains, max-on-OR, highest-confidence selection, threshold
gates, three-branch uncertain dispatch). They become a TypeScript library.

---

## 3. Workstream A — Replace Prism with TypeScript patterns

### A1. Build `@parallaxai/confidence` (new package)

A dependency-free TS library porting Prism's operator semantics. This is the
distilled IP of the whole Prism effort and should be publishable standalone.

```typescript
// Core type — plain data, JSON-serializable, no class wrapper games
interface Confident<T> {
  value: T;
  confidence: number; // 0..1
}

// Constructors / accessors
cf<T>(value: T, confidence: number): Confident<T>   // was:  x ~> 0.9
conf(x: Confident<unknown>): number                 // was:  <~ x

// Combinators — each ports one Prism operator's propagation rule
chain(...xs)                 // was: a ~~ b ~~ c   → min confidence
coalesce(primary, fallback, threshold = 0.5)  // was: a ~?? b
and(a, b)                    // was: a ~&& b       → min confidence
or(a, b)                     // was: a ~|| b       → max confidence
lift(fn)(a, b)               // was: ~+ ~- ~* ~/ ~== …  → apply fn to
                             //   values, min confidence. Covers all 10
                             //   arithmetic/comparison operators with one
                             //   higher-order function.
best(...xs)                  // was: a ~||> b ~||> c → highest confidence wins
gate(x, threshold, fn)       // was: check ~@> action → run fn only if
                             //   conf(x) >= threshold, else pass through
prop(x, 'a.b.c')             // was: x ~. a ~. b ~. c → safe access,
                             //   confidence degrades per missing hop

// Control flow — was: `uncertain if` with high/medium/low blocks
uncertain(x, {
  high:   (v) => ...,        // conf >= bounds.high   (default 0.8)
  medium: (v) => ...,        // conf >= bounds.medium (default 0.5)
  low:    (v) => ...,
}, bounds?)

// Aggregation — port the helpers currently injected as Prism globals in
// runtime-manager.ts:314-400 (average, synthesize, majorityVote) plus the
// consensus math duplicated across .prism pattern files
average(xs); majorityVote(xs); consensus(xs, opts); weightedMerge(xs)
```

Tasks:
- [x] Create `packages/confidence/` (tsup dual CJS/ESM — it's a published lib).
      **(Done M1)**
- [x] Port propagation rules; property-test them (fast-check) against the
      documented Prism semantics in `docs/prism-specs.md` before that doc is
      deleted. **(Done M1 — 27 tests: property tests for all 6 propagation
      rules + the spec's worked examples verbatim)**
- [x] Implement `average` / `synthesize` / `majorityVote` in this package
      (the runtime-manager copies at `runtime-manager.ts:314-400` die with
      that file in M2). **(Done M1)**
- [x] Replace the keyword-heuristic mock in
      `packages/sdk-typescript/src/confidence.ts` with re-exports from this
      package; `withConfidence` kept, `withConfidenceWrapper` now accepts an
      explicit extractor (`defaultExtractor` reads only real confidence
      fields — no keyword magic). **(Done M1)**
- [x] README with the Prism→TS operator mapping table. **(Done M1)**

**Acceptance:** the five consensus patterns' math is expressible in ≤ 20 lines
each using only this library (simple-consensus is a test case in
`test/spec-examples.test.ts`); package is npm-publishable (not yet published —
publish alongside M3 when the proto surface settles).

### A2. Patterns become registered TypeScript modules

Adopt the Temporal/Inngest model: **patterns are code that ships with the
deployment**, not scripts uploaded and evaluated at runtime. This deletes the
string-injection layer *and* the arbitrary-code-execution problem Prism's
sandbox was quietly solving.

New contract (in `packages/pattern-sdk` or a slimmed `pattern-core`):

```typescript
export interface PatternContext {
  input: Record<string, unknown>;
  agents: AgentHandle[];                 // pre-selected per requirements
  dispatch(task: string, opts?: DispatchOpts): Promise<Confident<unknown>[]>;
  // ^ the fan-out the PatternEngine already performs before invoking Prism —
  //   same agentResults data, now behind a method instead of injected vars
  logger: Logger;
  signal: AbortSignal;                   // honors options.timeout_ms
}

export interface PatternModule {
  meta: {
    name: string; version: string; description: string;
    requirements: { capabilities: string[]; minAgents: number;
                    maxAgents: number; minConfidence?: number };
    inputSchema?: z.ZodTypeAny;          // replaces @input JSDoc annotation
  };
  execute(ctx: PatternContext): Promise<Confident<unknown>>;
}
```

Loading: `patterns/index.ts` exports a manifest of `PatternModule`s, compiled
with the control plane. `PatternLoader` resolves names from the manifest first,
then the DB (which now stores a module reference + version, not source).

Control-plane changes:
- [x] `pattern-engine.ts`: agent selection/dispatch/eventing untouched;
      Prism execution block replaced with `module.execute(ctx)` under the
      same timeout/metrics/eventing. **(Done M2)**
- [x] **Deleted** `runtime-manager/` entirely (context-injection and
      value-unwrapping layers included) plus the `@prism-lang/*`
      dependencies. **(Done M2)**
- [x] `pattern-loader.ts`: loads modules from the @parallaxai/patterns
      manifest + org-chart YAML from the patterns dir; `.prism` parsing
      deleted. `savePattern` persists org-chart YAML only. **(Done M2 —
      note: the contract lives in the new `packages/patterns`, not
      pattern-sdk, which remains legacy and dies in A5/A6.)**
- [x] Upload paths: REST rejects `.prism` with a pointer to the module
      workflow; gRPC `UploadPattern` of a prism script now fails in
      `savePattern` with the same guidance (proto field rename lands in
      M3/A4). **(Done M2)**

**Acceptance (met):** control plane builds with no `@prism-lang/*` import;
`ExecutePattern` runs TS modules end-to-end — the engine integration tests
execute ConsensusBuilder / ConfidenceCascade / UncertaintyRouter through the
real engine and assert on the exact legacy output shapes.

### A3. Convert the pattern library

Convert all ~20 `.prism` files in `/patterns/` to `*.pattern.ts`. For scale,
here is `simple-consensus.prism` (45 lines + engine-side hacks) converted:

```typescript
import { cf, average, type PatternModule } from '@parallaxai/confidence';

export const simpleConsensus: PatternModule = {
  meta: {
    name: 'simple-consensus', version: '2.0.0',
    description: 'Average-confidence consensus across agents',
    requirements: { capabilities: [], minAgents: 2, maxAgents: 10 },
  },
  async execute(ctx) {
    const results = await ctx.dispatch(String(ctx.input.task));
    const avg = average(results.map(conf));
    return cf({
      status: avg > 0.7 ? 'consensus_reached' : 'low_consensus',
      agents: results.map((r, i) => ({
        name: ctx.agents[i].name, confidence: conf(r), result: r.value,
      })),
    }, avg);
  },
};
```

Order of conversion (each is a working checkpoint):
- [x] All 22 patterns converted to `packages/patterns/src/patterns/*.ts`
      and `/patterns/*.prism` deleted (`test-parallel-primitive` and
      `signal-noise-station` dropped — test artifact / personal-demo copy).
      Conversion notes are inline in each file where original behavior was
      buggy or unreachable (dead `uncertain if` branches, last-vs-first
      reduce idioms, unrolled loop caps). The `org-*.yaml` files are
      untouched — they never were Prism. **(Done M2)**
- [x] Engine pattern tests ported to the module path and passing.
      **(Done M2)**
- [x] `pattern-sdk` deleted whole in M3, language archaeology included.

### A4. Proto and client surface

Pre-GA with no external users locked in — rename now, cheaply, once:

- [x] `proto/patterns.proto` — `prism_script` field 5 replaced with
      `Pattern.DefinitionType definition_type = 5` + `string definition = 9`;
      gRPC `UploadPattern` accepts `ORG_CHART_YAML` only. **(Done M3)**
- [x] `ListPatternsRequest.include_scripts` → `include_definitions`. **(Done M3)**
- [x] Consumers swept: control-plane pattern-service, packages/cli
      (scenario command deleted; run/validate/upload are YAML-only),
      web-dashboard upload, sdk-python (client updated, stubs regenerated,
      tests pass), Go + Rust example stubs regenerated and building.
      packages/client and sdk-typescript never referenced the field.
      **(Done M3)**

### A5. Consolidate the two execution paths

The org-chart path is already Prism-free and is the product's main path.
Finish the consolidation:

- [x] Better than planned: **nothing consumed** `pattern-sdk`,
      `org-chart-compiler` (standalone), or `primitives` — all three
      packages deleted whole (incl. the learn-prism/debug test pile).
      Control-plane's own `org-patterns/` compiler is the single surviving
      org-chart compiler. **(Done M3)**

### A6. Excise the dependency

- [x] `@prism-lang/*` removed from every package.json (control-plane in
      M2; runtime + sdk-typescript in M3; primitives/pattern-sdk deleted).
      **(Done M3)**
- [x] `docs/prism-specs.md` and the Docusaurus Prism section deleted
      (semantics live in @parallaxai/confidence property tests). Helm's
      default `hello-world.prism` removed. **(Done M3)**
- [ ] Archive the external `prism-lang-ts` repo with a README pointing at
      `@parallaxai/confidence` — **manual step for Jakob** (external repo).
- [x] `CLAUDE.md`, `docs/ARCHITECTURE.md`, README positioning updated.
      **(Done M3)**

---

## 4. Workstream B — Cut dead weight

The repo should only promise what exists.

| Item | Action | Status / Rationale |
|------|--------|-----------|
| `packages/sdk-go` | Salvaged into `examples/polyglot/go-agent/` (module `parallax/examples/go-agent`), demo app folded in as `cmd/demo` | **Done (M0).** Had real, compiling code (contrary to the original audit) — but as an unmaintained SDK promise. Now an explicit example. The bit-rotted `grpc_demo` (used long-removed APIs) was dropped. |
| `packages/sdk-rust` | Salvaged into `examples/polyglot/rust-agent/`, demo folded in as `examples/full_agent.rs` | **Done (M0).** Compiled only against stale committed stubs; regenerating from current protos surfaced 4 rot errors (missing thread payloads, tonic `Connect` name collision, async-recursion Send cycle) — all fixed; now compiles against current protos. |
| `packages/monitoring` | Merged into root `/monitoring` (dashboards, alerts, richer prometheus.yml), package deleted, `monitor:*` scripts now use the root compose `monitoring` profile | **Done (M0).** Was not empty — it was the *better* of two duplicate monitoring dirs. |
| `packages/primitives` | **Deferred to Workstream A.** | Not M0-deletable: `pattern-sdk` has a live workspace dep + imports on it, and its content is `.prism` primitive files — it IS the Prism layer, and dies with it (A5/A6). |
| `packages/pattern-builder` + `apps/builder` + `demos/pattern-builder-demo` | Parked on branch `graveyard/pre-refocus`, deleted from main | **Done (M0).** The builder had two more consumers than audited (a Next app wrapper and a demo) — all three parked together. Revive only if users ask for visual editing. |
| `demos/signal-noise`, `demos/milady-swarm` | Moved to `demos/personal/` | **Done (M0).** `coding-swarm` stays as the flagship — see Workstream C. Every remaining demo must run from its README. |
| `docs/prism-specs.md`, Prism docs pages | Delete (per A6) | Pending Workstream A. |

### The polyglot story, done right

The Go/Rust SDKs existed to demonstrate that *any agent in any language* can
join the swarm. That claim is true because the contract is gRPC + the gateway
protocol — it does not require maintaining N client libraries. Replace SDKs
with proof:

- [x] `docs/any-language.md`: the contract is `proto/gateway.proto` +
      `registry.proto`. Register, stream, return `{value, confidence,
      reasoning}`. ~1 page. **(Done M0)**
- [x] `examples/polyglot/go-agent/` — self-contained module with generated
      stubs, gateway + direct-serve scaffolding, runnable `cmd/demo`.
      **(Done M0)**
- [x] `examples/polyglot/rust-agent/` — same, salvaged from sdk-rust and
      fixed to compile against current protos. **(Done M0)**
- [x] Keep **sdk-typescript** (primary) and **sdk-python** (complete, real
      users on the Pi fleet) as the two maintained SDKs.

This turns "we promise 4 SDKs" (and deliver 2) into "any language, here's
proof in 3, SDK convenience in 2" — a stronger claim, honestly kept.

---

## 5. Workstream C — Deliver the focused product

### C1. Flagship: the coding swarm, end to end

One demo is the product's front door: `demos/coding-swarm/`. Definition of
done — a newcomer on a laptop, in ≤ 10 minutes:

1. `pnpm start` (control plane + deps via docker-compose)
2. Point it at `coding-swarm.org.yaml` (already exists) — e.g. a
   supervisor + 2 implementers + 1 reviewer
3. Real CLI agents spawn in local PTYs (runtime-local), visible in the
   dashboard's xterm views
4. Give the team a task; watch it route through the org chart; watch a
   low-confidence result escalate to the supervisor
5. Same YAML, `--runtime docker` / `--runtime k8s` / gateway-attached Pi —
   topology unchanged, hardware swapped

Tasks: write the README as the spec, then fix whatever breaks while making
it true. Record one 3-minute screen capture for the repo/site.

### C2. Make confidence *earn its billing* (in the org-chart path)

Prism's `uncertain if` semantics return as **workflow policy** where they
always belonged. `message-router.ts` already has `escalationPath` plumbing —
extend it:

- [ ] Per-role thresholds in org-chart YAML:
      ```yaml
      roles:
        implementer:
          confidence:
            accept: 0.8        # done
            retry_below: 0.6   # one retry with critique appended
            escalate_below: 0.4  # route to supervisor role
      ```
- [ ] Wire into `workflow-executor.ts` step completion: accept / retry /
      escalate / surface-to-user, driven by `Confident` results and
      implemented with `gate()`/`uncertain()` from A1 (the library must be
      good enough to build the product on — that's the dogfood test).
- [ ] Surface confidence trajectory per thread in the dashboard (the
      `confidence-tracker` package's anomaly detection finally gets a
      consumer: flag a role whose confidence is degrading mid-workflow).

### C3. Dashboard: verify, finish, or trim

Audit `apps/web-dashboard` against C1's script. Whatever doesn't serve
"watch a swarm run, inspect threads, see confidence/escalations" gets cut or
back-logged. Unclear-completeness UI is worse than less UI.

### C4. Docs and positioning rewrite

- [ ] Root README + Docusaurus landing: lead with the coding-swarm demo GIF
      and the org-chart YAML. Confidence routing is the differentiator
      paragraph, not the headline abstraction.
- [ ] Remove/redirect all Prism docs; add the `@parallaxai/confidence` and
      any-language pages.
- [ ] Update `CLAUDE.md` (build commands, package list, pattern authoring).

---

## 6. Sequencing

Ordered for momentum (fast visible wins first) and dependency:

| Milestone | Contents | Effort (solo, rough) |
|-----------|----------|----------------------|
| **M0 — Purge** | Workstream B deletions + polyglot examples + CLAUDE.md/README truth pass | 2–4 days |
| **M1 — Confidence lib** | A1 complete, property-tested, published | ~1 week |
| **M2 — Pattern runtime** | A2 + first 5 patterns converted (A3 start); Prism path deleted from control-plane | 1–2 weeks |
| **M3 — Surface sweep** | A4 proto rename + client/CLI/SDK updates; remaining patterns; A5 compiler consolidation; A6 dependency excision | ~1 week |
| **M4 — Product** | C1 flagship demo true end-to-end; C2 confidence policy; C3 dashboard audit; C4 docs | 2–3 weeks, then ongoing |

Notes:
- M0 first: it's cheap, it makes every later `grep` cleaner, and it resets
  the repo to honesty before any new promises.
- M2 can run the TS path behind an env flag for a few days if you want a
  soft cutover, but with no external pattern authors there's little reason
  to keep dual paths longer than one milestone.
- The Pi/edge demos keep working throughout: the gateway and org-chart paths
  never touched Prism.

---

## 7. What NOT to do (as binding as the rest)

- **No new SDK languages.** Examples prove polyglot; two SDKs are maintained.
- **No new runtimes.** Local, Docker, K8s, gateway cover every story.
- **No enterprise features ahead of users.** RBAC/mTLS that exist stay;
  nothing new (multi-tenancy, licensing, backup UX) until someone deploying
  parallax asks.
- **No pattern marketplace / visual builder / hosted anything** until the
  flagship demo is converting strangers into users.
- **No further Prism investment** — no "one last fix" to `@prism-lang/core`.
  The archive README is the last commit.
- **No new demos** until `coding-swarm` meets its README spec.

---

## 8. Success criteria

Three months out, this refocus worked if:

1. A stranger runs the coding-swarm demo from the README in ≤ 10 minutes and
   sees an escalation happen.
2. `grep -r "prism" packages/ proto/ apps/` returns nothing but CHANGELOG
   history.
3. `@parallaxai/confidence` and the PTY stack have downloads/issues from
   people who've never run the parallax control plane — the wedges are
   working independently.
4. Every directory in `packages/` and `demos/` either builds+tests green or
   doesn't exist.
