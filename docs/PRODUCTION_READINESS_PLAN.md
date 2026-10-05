# Production readiness plan

Written October 5, 2026, against branch `codex/enterprise-hardening` at `9be347c`
plus its uncommitted working tree. `main` is at `e3c98eb`.

This plan takes Parallax from "substantial engineering prototype" (its own
[readiness review](ENTERPRISE_READINESS_REVIEW_2026-09-04.md)) to a system a
team can run in production and that other systems can embed. It records what is
true today, with file evidence, the order of work, and how each phase is
accepted. Every claim in the brief was checked against the code before it was
written down here; corrections are listed in
[What the brief gets wrong](#what-the-brief-gets-wrong).

Paths beginning `cp/` are under `packages/control-plane/src/`.

## Baseline measured on October 5, 2026

Node 24.21.0, pnpm 10.11.0, on the uncommitted working tree, using the same
commands CI runs.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passes. The lockfile matches the edited manifests. |
| Build (CI filter) | **Fails** in 3 of 25 tasks: `@parallaxai/control-plane` (2 type errors introduced by the uncommitted lint/typing edits), `@parallaxai/security` (2 pino call-signature errors after the pino upgrade), `docs` (Docusaurus 3.10 needs `@docusaurus/faster`). |
| Biome | **1 error** (formatting in `cp/licensing/license-keys.ts`), 1,483 warnings, mostly `noExplicitAny` in demos. |
| ESLint (`turbo lint`) | **Fails**: `sdk-typescript`'s `buf lint` walks `node_modules/grpc-tools` protos; packages depending on the broken builds fail too. No ESLint errors otherwise, only warnings. |
| Typecheck | **Fails**: the same 4 errors as the build. |
| Unit tests (`CI=true turbo test`) | 1 real failure: a license-key test expects the old error string after the uncommitted format check changed it. `@parallaxai/patterns` has no test files and vitest exits 1. Two `pty-console-agent-containers` demo smoke tests need real CLIs. Control plane: 410/411 pass. Runtime-k8s 122, runtime-docker 82, parallax-agent-runtime 120 pass. |
| Watch-mode test scripts | 10 packages use `"test": "vitest"`, which hangs outside CI. |
| Production audit (`pnpm audit --prod`) | 1 critical, 6 high, 7 moderate, 3 low. Full graph including dev: 11 critical, 84 high. The 9/4 figure of "4 critical, 101 high" predates the uncommitted upgrades. |
| CI history | Every `ci.yml` run on record has failed (latest July 20). CI has never run on `codex/enterprise-hardening` because no PR exists. CI only triggers on pull requests. |

Remaining production high/critical advisories:

| Advisory | Path | Fix available |
| --- | --- | --- |
| `next` 16.2.0–16.3.5 (critical) | `apps/marketing` | Upgrade to ≥16.3.6 |
| `@grpc/grpc-js` 1.14.0–1.14.4 | `demos/personal/signal-noise` | Upgrade to ≥1.14.5 |
| `brace-expansion` <1.1.20 (×2) | `apps/docs` → Docusaurus → serve-handler | Override |
| `node-forge` ≤1.4.0 | `packages/security` | No patched version; replace or allowlist |
| `http-cache-semantics` ≤4.2.0 | `apps/docs` → update-notifier | No patched version; docs build only |
| `braces` ≤3.0.3 | `apps/docs` → copy-webpack-plugin | No patched version; docs build only |

## The uncommitted work on `codex/enterprise-hardening`

132 changed paths: 126 modified, 6 untracked. It is a follow-up to the
hardening commit `9be347c`, made the same evening (September 4). By content:

| Group | Files | Status | Decision |
| --- | --- | --- | --- |
| Dependency remediation | 40 `package.json` files, `pnpm-lock.yaml`, root `pnpm.overrides`, new `packages/docs-image-metadata` (a sharp-based replacement for the vulnerable `image-size` inside Docusaurus) | Unfinished: it breaks three builds (above) | Keep, finish, commit as one "deps" commit with the code changes the upgrades require (OpenTelemetry 2 resource API in `telemetry`, typed `EventEmitter` in `cp/ha/*`, `cp/scheduler/*`). |
| Formatting and import order (Biome) | ~60 files across control plane, SDKs, runtimes, demos | Finished, mechanical | Keep, commit separately as a no-behaviour-change commit. |
| ESLint flat config and typing fixes | `eslint.config.mjs`, `apps/web-dashboard/eslint.config.mjs`, `cp/api/agents.ts`, `cp/server.ts`, `lint` script changes | Unfinished: two of these edits cause the control-plane type errors | Keep, fix the two errors, commit separately. |
| License revocation | `cp/licensing/license-keys.ts`, `scripts/generate-license-key.ts` | Finished security fix: revokes the credential previously committed to Helm values, rejects non-canonical encodings, stops printing generated keys | Keep. Update the one stale test. Commit separately as a security fix. |
| Python SDK lint | `packages/sdk-python/**`, `pyproject.toml`, CI `ruff check` + `poetry build` | Finished, mechanical (ruff) | Keep, commit separately. |
| CI filters | `.github/workflows/ci.yml` | Finished | Keep, folded into the Phase 0 CI work. |
| `REPORT_PARALLAX.md` | untracked, August 6 | Finished investigation report referenced by the brief | Moved to `docs/reports/2026-08-06-branch-durability-oracles.md`. |
| `docs/ENTERPRISE_CONTINUATION_PLAN.md` | untracked, September 4 | Finished design document | Commit as-is; this plan references it. |
| `patterns/gateway-dryrun.org.yaml` | untracked, July 25 | Experimental fixture for a gateway dry run | Commit under `patterns/experimental/` with a header saying so. Nothing is dropped. |

Nothing in the working tree is discarded. Every file above is listed in the
Phase 0 pull request.

## Current state by area

### Branch and CI (brief §1)

- `9be347c` is pushed to `origin/codex/enterprise-hardening` but not merged.
  Merging it changes behaviour for every caller: REST, gRPC and runtime APIs
  now require credentials, and production gRPC requires TLS.
- **Merging to `main` deploys.** `build.yml` runs on every push to `main` and
  `deploy.yml` runs after it. The hardened Helm chart requires secrets
  (`parallax-secrets` with `JWT_SECRET`, `PARALLAX_GRPC_API_KEY`,
  `PARALLAX_RUNTIME_API_KEY`; `parallax-grpc-tls`; `parallax-http-tls`) that
  the live cluster may not have. Helm uses `--atomic`, so a failed rollout
  rolls back, but Pi and laptop gateway agents also need the new key.
- CI already has Postgres/etcd integration (`pnpm test:db:isolated`), a Python
  job, Helm validation and an audit job, but these exist only on the unmerged
  branch.
- `.nvmrc` pins 24.20.0 and `packageManager` pins pnpm 10.11.0. Turbo is a
  caret range (`^2.3.3`, resolved 2.5.5). There is no `verify` script.
- No Changesets, no tags in any of the eight repositories, no publish
  workflow. Packages are published by hand with `prepublishOnly`.
- `build.yml` builds 3 images (control plane, dashboard, runtime-k8s). The 5
  agent images under `packages/runtime-docker/images/*` are documented in
  `docs/PRODUCTION_CHECKLIST.md` but never built.

### Security (brief §2)

| Claim | Verified state |
| --- | --- |
| One shared gRPC key | True. `cp/auth/grpc-security.ts:16-27`, installed server-wide at `cp/grpc/grpc-server.ts:46-51`. Optional mTLS proves CA membership only; the certificate is never bound to an `agent_id`. |
| Session hijack by re-registering | True, and worse than stated. `cp/grpc/services/gateway-service.ts:148-190` replaces any existing session for the claimed `agent_id`. The old stream's close handler later deletes the *new* session (`:105-128`). A disconnect resolves every agent's pending requests (`:729-739`). Any agent can answer any task (`:255-311`). Heartbeats accept any `agent_id` (`:236-249`). `handleThreadSpawnResult` credits threads to the first session (`:444-452`). |
| Placement falls back | True. `cp/agent-runtime/gateway-runtime-adapter.ts:533-542` drops metadata and matches type only; a third pass matches capabilities. `metadata.agentId` is only used in the error message. |
| Principals and roles | REST has RBAC (admin/operator/viewer, `cp/auth/rbac.ts`), but sending input to a live thread maps to `agents:update` with no ownership check (`cp/api/managed-threads.ts:277-292`). gRPC has no principals at all; `dispatchThreadInput` does no authorization. |
| API keys hashed | Already true, with unsalted SHA-256 (`cp/api/users.ts:407`). Acceptable for high-entropy keys; will move to keyed HMAC with a key prefix for lookup. |
| Audit of registration/assignment | None. `AuditService` exists only behind the `audit_logging` license feature, and its middleware is not installed. |
| Swarm agent command injection | True. `demos/coding-swarm/coding-swarm-agent/src/thread-executor.ts:468,478,485` interpolate clone URL and branch into `execSync`. |
| Token in clone URL | True (`:491-503`), persisted in `.git/config`. The token also travels in `preparation_json` (`cp/org-patterns/workflow-executor.ts:541` → `gateway-runtime-adapter.ts:241`) to whichever agent placement picks, including a hijacker. |
| Context-file traversal | True (`thread-executor.ts:164-171`). |
| Env injection | True (`:251-253`). |
| Default `autonomous` | True (`:176`). The control plane's `preparation.approvalPreset` is ignored by the agent. |
| Docker hardening | `docker-runtime.ts:186-193` sets memory, CPU, network only. Images already run as `USER agent`; the Docker socket is not mounted into agents. Provider keys are env vars (`:578-584`). Base images are tag-pinned, not digest-pinned. |
| Kubernetes hardening | Resource limits exist (`agent-controller.ts:201-204`). No pod `securityContext`, no `NetworkPolicy`. Keys use `secretKeyRef` (env), not files. |
| Supply chain | No digests, SBOMs, signing, provenance, Renovate or Dependabot anywhere. |

### Durability (brief §3)

- Gateway sessions, pending requests and the thread→session map are process
  memory (`gateway-service.ts:45-48`). Thread events *are* persisted
  (`server.ts:535-537` → `ThreadRecord`/`ThreadEventRecord`), but nothing
  restores dispatch after a restart.
- `9be347c` made cancellation and terminal transitions real and conditional,
  and stopped HA recovery from orphaning healthy work. Restart recovery still
  marks work failed rather than resuming it.
- `AgentHello`/`ServerAck` carry no protocol version, inventory or fencing.

### Results and artifacts (brief §4)

- `proto/gateway.proto` returns `workspace_dir` and free-form event JSON; no
  diff, bundle, test results or usage. A second copy lives in
  `packages/sdk-typescript/proto/`.
- `git-workspace-service` `finalize` calls `pulls.create` with no lookup and no
  draft default (`workspace-service.ts:443`, `github-provider.ts:358`).

### Budgets and policy (brief §5)

None exist. `--max-budget-usd` applies only in Claude `--print` mode
(`coding-agent-adapters/src/claude-adapter.ts:367-375`); threads are
interactive by default.

### Runtimes (brief §6)

| Runtime | Agents | Threads | Notes |
| --- | --- | --- | --- |
| Local | Yes | Yes | Host user, host credentials. |
| Docker | Yes | 501 | No thread implementation. |
| Kubernetes | Yes | 501 | Internal thread methods exist but are unreachable and reject preparation/policy. |
| Gateway | Yes | Yes | Interactive threads on remote machines; no artifact return. |
| Cloud Run Jobs | No | No | Does not exist. |

### Embedding (brief §7)

`parallax-agent-runtime` (0.8.9, published) is an MCP server. There is no
`runTask` library API and no published gateway client beyond the SDK's
`ParallaxAgent.connectViaGateway`.

### Observability (brief §8)

Pino everywhere; `@parallaxai/telemetry` wraps OpenTelemetry tracing. No
correlation ID spans gateway → agent, no redaction test, health endpoints do
not check dependencies, no runbooks, no measured sizing.

### Testing and docs (brief §9, §10)

Control-plane, runtime and SDK suites are healthy. Missing: gateway contract
tests, adversarial tests, chaos tests, coverage gates, any real-CLI end-to-end
test in CI. `packages/confidence-tracker` is dead (no dependents).
`README.md` still claims Node ≥18 and does not describe the security model.

## What the brief gets wrong

1. **Gateway service path.** It is `packages/control-plane/src/grpc/services/gateway-service.ts`, not `src/gateway/`.
2. **Audit counts.** "4 critical, 101 high" was the September 4 figure before the uncommitted upgrades. Production is now 1 critical, 6 high. Three of the six highs have no upstream fix and live only in the docs build.
3. **API keys are already hashed** (unsalted SHA-256). REST already has per-user principals and roles. The gaps are gRPC principals, per-resource ownership and the `ThreadInputRequest` path.
4. **Gateway state is not entirely in memory.** Thread events and thread records are persisted. Sessions, pending requests and dispatch are not.
5. **Agent images already run as non-root** and the Docker socket is not mounted into agent containers. The missing controls are capabilities, read-only root, `no-new-privileges`, seccomp, pids limits and egress policy.
6. **Kubernetes already sets resource limits.** Its threads are not "experimental"; `9be347c` deliberately disabled them (HTTP 501) because preparation and policy were not enforced.
7. **CI already has a real-Postgres integration job** and an audit gate, on the unmerged branch. The problem is that CI has never passed and never run on that branch.
8. **"Tokens never touch disk" conflicts with subscription logins.** Claude Code and Codex OAuth logins are files under `~/.claude` and `~/.codex` by design. The plan applies the rule to Parallax-issued credentials (GitHub tokens, provider API keys Parallax delivers) and treats CLI logins as host credentials, recorded per run for cost attribution. A machine that uses OAuth logins is a trusted host by definition; that goes in the threat model.
9. **"One phase per PR" does not fit sections 2, 3, 6 and 7.** Each is several weeks of work. Each phase below is a short stack of focused PRs instead.
10. **Missing from the brief: merging deploys.** Landing Phase 0 on `main` triggers an automatic GKE rollout that needs new secrets. See decision D1.
11. **Missing from the brief: tenancy.** The continuation plan's Wave A (tenants, projects, row-level isolation) is not in the brief. This plan targets a *dedicated deployment per customer/team* and defers multi-tenant hosting. See decision D4.
12. **Two durability designs disagree.** The brief puts durability on the gateway path; `ENTERPRISE_CONTINUATION_PLAN.md` starts with a Docker operation adapter and keeps interactive gateway threads non-resumable. This plan follows the brief for task assignment (leases, fencing, idempotency keys on the gateway) and the continuation plan's rule that an uncertain interactive stdin write is parked, never repeated.

## Sequence

Each phase is a short stack of PRs into `main`. Each PR carries tests that fail
without it, docs, a changeset (or root `CHANGELOG.md` entry for unpublished
code) and green CI. Refactors and behaviour changes are separate PRs. Breaking
changes to published packages get a major (or, below 1.0, minor) bump and a
migration note.

### Phase 0 — clean baseline

PRs:

0.1 **Land the hardening branch.** Commit the uncommitted work as: deps
remediation; formatting; ESLint config and typing; license revocation; Python
lint; docs. Fix the four type errors, the docs build, the `buf lint` scope, the
stale license test, `patterns` with no tests, and watch-mode test scripts.
Make the audit gate pass with upgrades plus a documented allowlist
(`audit-allowlist.json`, reason and revisit date per advisory, checked by a
script so the gate stays on). Make `deploy.yml` manual until secrets are
provisioned (D1).
0.2 **Toolchain.** Pin Turbo exactly; `engines` and `.nvmrc` agree; add
`pnpm verify` (install check, build, lint, typecheck, unit tests); CI runs on
push to `main` as well as PRs; matrix job on `ubuntu-latest` and `macos-latest`
for `pnpm install && pnpm verify`.
0.3 **Release automation.** Changesets in Parallax; a release workflow that
versions, tags and publishes with npm provenance; the same workflow in each
sibling repo (seven small PRs); CI builds all eight images, including the five
agent images.

Acceptance:

- `main` contains `9be347c` and all uncommitted work, every file listed in the PR.
- On a fresh clone, `pnpm install --frozen-lockfile && pnpm verify` exits 0 on macOS and Linux in CI.
- CI runs lint, typecheck, unit, integration (real Postgres and etcd) and build for every non-demo package on every PR and on `main`, and is green.
- `pnpm audit --prod --audit-level high` passes with the allowlist; removing an allowlist entry makes the job fail.
- A tagged release publishes a test package version with provenance; the tarball rebuilds byte-identically from the tag.
- CI builds all eight Dockerfiles that the docs list.

Found while executing 0.1, to fix in 0.3 or the phase noted:

- `pty-manager` 1.12.1's ESM build uses `__dirname` in `ensure-pty` and the
  worker path lookup, so `spawn()` throws `ReferenceError` for ESM
  consumers. The `pty-console-agent-containers` demo's hook-marker test
  reproduces it. Fix in the `pty-manager` repo with a patch release (0.3).
- Four examples and three demos no longer build against the current SDK
  (`analyze` signature, missing `connectViaGateway`/`serve` on subclasses).
  CI excludes `examples/` and `demos/` as it did before; Phase 5 replaces
  the examples with a tested consumer, Phase 10 labels or removes the rest.
- `@parallaxai/patterns` has no tests; added to Phase 10.

### Phase 1 — threat model and gateway identity

PRs: `docs/THREAT_MODEL.md` (assets, actors, boundaries, abuse cases, mitigations
with owners and test names; includes prompt injection, §2.4); machine
enrollment (one-time token → per-machine credential; Postgres `Machine` table
with status, last seen, credential fingerprint); session binding (a stream can
act only as its authenticated machine; reconnect requires the same identity;
fixes to the cleanup and cross-agent bugs above); revocation and rotation API
and CLI; strict placement (`placement: { machineId | ownerId, fallback:
'deny' | 'allow' }`, default deny when a target is named, fallback recorded);
gRPC principals and roles (submit, input, machine-admin) and ownership checks
on thread input; audit events for registration, assignment, input and
revocation, independent of licensing.

Acceptance: adversarial tests prove a machine cannot register as another
machine, cannot take over a live session, cannot answer another machine's task
and cannot keep another machine alive; a revoked machine is disconnected within
one heartbeat and cannot reconnect; a targeted task either runs on its machine
or fails with a placement error, and an allowed fallback writes an audit
record; a principal without the input role gets `PERMISSION_DENIED` on
`ThreadInputRequest`; every high-severity item in the threat model has a
linked test.

### Phase 2 — the developer-machine agent

PRs: extract `demos/coding-swarm/coding-swarm-agent` into a published package
(`@parallaxai/machine-agent`, D3) with the demo depending on it; `execFile`
argument arrays and validated repo URLs/branches; GitHub App installation
tokens delivered through `GIT_ASKPASS` from memory, never in URLs, preparation
JSON or logs, and revoked at task end; path containment shared with
`runtime-local`; environment allowlist; least-privileged default preset with
elevated presets requiring a per-task policy grant that is audited; a git
worktree per task; optional Linux confinement (dedicated user or rootless
container); docs that say an approval preset is CLI behaviour, not a security
boundary.

Acceptance: injection, traversal, env-injection and malicious-repo tests fail
on the demo code and pass on the package; a grep of `.git/config`, logs and
the gateway transcript after a task finds no token; a task with no explicit
preset runs with the least-privileged preset.

### Phase 3 — container hardening and supply chain

PRs: Docker `HostConfig` hardening (non-root, `CapDrop: ALL`, read-only root
plus writable workspace tmpfs/volume, `no-new-privileges`, default seccomp,
pids limit, no host mounts) and per-task egress (deny by default; allowlisted
proxy for model provider, GitHub and registries); credentials as files mounted
per task; Kubernetes equivalent (pod `securityContext`, `NetworkPolicy`,
projected secrets); digest-pinned base images, SBOM (syft) and cosign signing
in `build.yml`; Renovate with the audit gate required.

Acceptance: a real-Docker test inspects a running agent container and asserts
every control; an egress test reaches an allowed host and is refused by a
denied one; a test asserts no provider key appears in `docker inspect` env;
images in the registry carry a verifiable signature and SBOM.

### Phase 4 — artifacts protocol and idempotent publication

PRs: versioned `TaskArtifacts` message in `gateway.proto` (bundle or patch
series against a declared base commit, changed files, command/test results with
exit codes, bounded transcript, summary, usage; size limits; SHA-256 per part;
task ID and fencing token); a single proto source with a check that the SDK
copy matches; artifact store (Postgres metadata, object storage for blobs);
`git-workspace-service` idempotent PRs (marker in branch and body, lookup
before create, ambiguous-state reconciliation, draft by default) as a minor
release; "produce only" mode that returns artifacts without pushing.

Acceptance: a gateway task returns a bundle that applies cleanly to the base
commit and matches its hash; oversized or tampered artifacts are rejected; a
second `finalize` after a dropped response finds the existing PR instead of
creating another; produce-only mode makes no provider write calls.

### Phase 5 — embedding surface

PRs: `runTask()` in `parallax-agent-runtime` (local and Docker first, no
control plane); a published gateway client package and protocol doc so a third
party can host the gateway; contract tests pinning the public types and proto;
`examples/embedded-runner` as the Lookout-shaped consumer.

Acceptance: the example runs `runTask` against a scratch repo with a fake CLI
in CI and returns a diff, results and usage; a contract test fails on any
breaking change to the exported types or proto.

### Phase 6 — durable execution

PRs: Postgres tables for task assignments, leases (expiry, fencing epoch) and
gateway sessions; idempotency keys on tasks and events with unique
constraints; `AgentHello` with protocol version and in-flight inventory;
reconciliation on reconnect; cancellation propagated to the agent process with
workspace and credential cleanup; chaos tests.

Acceptance: kill the control plane mid-task, restart, and the task either
completes once or fails with a reconciliation reason; a late result with an old
fencing token is rejected; a duplicated task delivery runs once; a duplicated
event is stored once; clock-skew injection does not expire a live lease early;
cancellation leaves no process, worktree or token behind.

### Phase 7 — budgets, policy and kill switch

PRs: usage parsing from each CLI's output where available, with a
`credentialKind` (subscription/OAuth vs API key) per run; budgets per
execution, user and org (wall clock, turns, tokens, money) enforced by the
machine agent and the runtimes; a policy model per user/team/repo (CLIs,
models, presets, runtimes, machines, egress); a global kill switch.

Acceptance: a budget breach stops the agent within one turn and records why;
a disallowed preset or runtime is rejected before spawn; the kill switch stops
every running agent across runtimes and refuses new work until cleared.

### Phase 8 — runtime parity and Cloud Run Jobs

PRs: Docker managed threads; Kubernetes threads with preparation and policy;
`runtime-cloudrun-jobs` (hardened image, file-mounted secrets, egress via
Direct VPC egress and firewall rules, artifacts protocol); a capability matrix
generated from a shared conformance suite; the control-plane hosting decision
written down (D2).

Acceptance: one conformance suite (spawn, prepare, ready, output, blocked,
input, complete, cancel, artifacts, cleanup) runs against every runtime; the
published matrix is generated from its results.

### Phase 9 — observability and operations

PRs: correlation IDs from submission to agent; pino redaction with a test that
feeds known secrets through every logger; OpenTelemetry metrics (queue depth,
latency, failures by cause, budget use, connected machines, lease expiries);
readiness that checks Postgres and etcd; runbooks; measured sizing.

Acceptance: a redaction test fails if any configured secret shape reaches a
log line; `/ready` reports not-ready when Postgres is down; runbooks are each
rehearsed once and dated; sizing numbers come from a recorded load run.

### Phase 10 — documentation and cleanup

Runs alongside every phase, with a final pass: accurate README, architecture,
security guide, deployment guide (local, Docker, GKE, Cloud Run Jobs), API
reference, embedding guide, changelog; delete `packages/confidence-tracker`;
label demos and prototypes.

### Testing (brief §9)

Each phase adds its own unit, integration and adversarial tests. Cross-cutting
additions land with the phase that needs them: gateway contract tests (Phase 1
and 4), chaos tests (Phase 6), the real-CLI end-to-end test behind a flag with
a spending cap (Phase 5, needs D5), and a coverage gate on `control-plane/auth`,
`gateway`, placement, credential and path-containment code (Phase 1, raised as
later phases land).

## Decisions needed from Jakob

- **D1. Deploying `main`.** Merging the hardening branch auto-deploys to GKE and requires new secrets and new keys on every gateway agent. Recommended: Phase 0 makes `deploy.yml` manual-only until you have provisioned the secrets listed in `docs/DEPLOYMENT_HARDENING.md`; you re-enable it when ready.
- **D2. Control-plane hosting.** Recommended: keep the control plane on GKE (or a VM) because gateway streams are long-lived; use Cloud Run Jobs only as an agent runtime.
- **D3. Package name** for the promoted machine agent. Recommended: `@parallaxai/machine-agent`.
- **D4. Tenancy.** Recommended: dedicated deployment per team/customer now; the continuation plan's multi-tenant Wave A later.
- **D5. Paid end-to-end test.** Which CLI and key, and the monthly cap. Recommended: Claude Code with an API key, scheduled weekly, capped at $5 per run.
- **D6. npm and registry setup** you have to do outside the repo: npm trusted publishing (or an `NPM_TOKEN` secret) for each package, and GitHub Actions enabled on the seven sibling repos.
- **D7. Durable execution engine.** Recommended: Postgres leases and fencing in-process (smaller footprint) rather than Temporal; revisit after Phase 6 if workflow complexity grows.
