# Enterprise continuation: projects and durable declarative execution

Design date: September 4, 2026. This is an implementation plan for the next three waves, based on the current hardened working tree. It does not claim these capabilities already exist. No production migration or deployment is included.

## Outcome and support boundary

Deliver a project-scoped declarative workflow that survives a control-plane process restart: completed steps retain their results; a surviving worker completes its already accepted operation; a new coordinator reconciles that operation and advances the remaining steps without submitting the same agent turn again. Durable cancellation, human approval, verification evidence, and publication intent survive the same restart.

PostgreSQL owns workflow state, command intent, ownership, approvals, and delivery records. The existing event bus remains a notification mechanism. Workers must support command identity, durable receipts, inventory, and fencing before a workflow can advertise automatic recovery. A lease expiring alone never proves that external work stopped.

Arbitrary TypeScript pattern modules remain explicitly `legacy_nonresumable`. Their JavaScript closures, unrestricted I/O, and remote side effects cannot be reconstructed from an execution row. Keep their hardened cancellation behavior; after coordinator loss, record reconciliation-required failure instead of rerunning the module. Reject a request for durable execution of an unsupported module. Production multi-customer hosting must also disable in-process tenant-authored modules until isolated module execution is available.

The initial durable worker implementation should be a bounded operation adapter in the existing Docker runtime, using deterministic container identity and persisted operation receipts. Support one isolated task per operation and control-plane restart recovery first. Existing interactive gateway/local threads may continue under the legacy mode; do not declare durable stdin delivery merely because a command row exists. An uncertain interactive send must be parked rather than repeated.

## Evidence and APIs that actually exist

Read these sources before implementing their integration points:

| Existing source | Verified interface or behavior | Consequence |
|---|---|---|
| `packages/control-plane/prisma/schema.prisma` | `Execution` has status, nodeId and timeout; no step attempts or lease epoch. `Pattern.name` is globally unique. Threads, memory, workspaces and credential grants have no project. | Add explicit ownership and operational state; existing rows are insufficient checkpoints. |
| `src/db/database.service.ts` | `transaction(fn)` supplies a Prisma transaction client; repositories currently retain the global client. | New scoped repositories must use the supplied transaction client, including their outbox writes. |
| `src/db/repositories/execution.repository.ts` | `transitionStatus(id,status,updates)` conditionally accepts pending/running rows. | Reuse terminal compare-and-set intent, adding project and owner epoch predicates for durable runs. |
| `src/org-patterns/workflow-executor.ts` | `execute(pattern,input,{executionId,signal})`; context variables, role assignments, retries and step results live in memory. | Keep the legacy executor and extract reusable leaf behavior; build a persisted interpreter for supported declarative nodes. |
| `src/org-patterns/types.ts` | Assign, sequential, parallel, condition, select, aggregate, agent review and agent approval exist. | Persist stable nested node keys, branch decisions and each external attempt. Add human approval as an explicit new type. |
| `src/pattern-engine/interfaces.ts` | `PatternEngineServices.commandVerifier`, `setCommandVerifier`, execution ID and timeout options exist. | Wire the isolated verifier through this seam; add project and durable-mode context explicitly. |
| `src/agent-runtime/{agent-runtime-service.ts,gateway-runtime-adapter.ts}` | Spawn/get/list/stop threads and send input exist; routing and gateway thread handles are Maps. | Introduce a versioned durable operation contract; current methods do not provide durable command lookup or fencing. |
| `packages/sdk-typescript/proto/gateway.proto` | Request IDs, thread event sequence and hello exist; hello has no inventory or acknowledged-operation replay. | Add protocol fields/messages and generate SDK bindings; do not invent support in old clients. |
| `src/threads/thread-persistence.service.ts` | `recoverFromRuntimes()` upserts `listThreads()` snapshots. | Recovery is currently a projection refresh, not a resumption protocol. |
| `src/threads/memory-context.service.ts`, `src/org-patterns/decision-history.ts` | Prior experiences/history may be queried by repository, role or family without project. | Scope candidates before scoring/pooling; a matching repo name is not authorization. |
| `src/workspace/index.ts` | Re-exports `WorkspaceService` from `git-workspace-service` 0.4.6. `finalize(workspaceId, options)` pushes and creates a PR. | Finalize does not freeze or commit dirty contents and its workspace registry is in memory. Durable publication needs a new adapter and persisted reconstruction. |
| `src/workspace/providers/github-provider.ts` | `createPullRequest()` calls Octokit's `pulls.create`. | There is no existing provider-level idempotency method. Implement explicit lookup/reconciliation using documented provider APIs. |
| `src/auth/{api-authorization.ts,grpc-security.ts}` | HTTP global role/scope checks; gRPC shared trusted-service key. | Neither currently supplies customer membership or per-worker project identity. |

Paths starting `src/` above are under `packages/control-plane/`. New types/methods named below are proposed contracts, not existing APIs.

PostgreSQL supports transactional queue claims using `FOR UPDATE SKIP LOCKED`; use it only to claim work, not as an external-effect guarantee. [PostgreSQL SELECT documentation](https://www.postgresql.org/docs/current/sql-select.html)

## Wave A — ownership, schema and session foundations

### A1. One owner for schema and migrations

Add the following schema in sequenced migrations, with one schema owner to avoid divergent generated clients. Use ordinary PostgreSQL tables. Existing time-series setup already supports ordinary PostgreSQL; durable control rows must not depend on optional TimescaleDB.

| Model/change | Required fields and constraints |
|---|---|
| `Tenant`, `Project` | Tenant ID, project ID/tenant ID, status, display name/slug; unique tenant+slug. Project deletion initially means disable, not recursive data destruction. |
| `TenantMembership`, `ProjectMembership` | User ID, scope ID, role, status/version; unique user+scope. Tenant admin can administer projects/memberships within that tenant. |
| `User.platformRole` | Separate `platform_admin` from project roles. Existing first installation admin migrates to platform authority; newly created customer admins never receive global user administration. |
| Ownership columns | Non-null `projectId` on Pattern, PatternVersion, Agent registration, Execution, thread/event, shared decision, episodic experience, confidence metrics, Schedule/Run, Trigger, Workspace, CredentialGrant and new durable tables. Add tenant/project context to audit records. Use composite foreign keys `(projectId, resourceId)` to prevent cross-project relationships. |
| Pattern identity | Replace unique name with unique `(projectId,name)`; version uniqueness also carries project. Bundled file patterns become a read-only catalog that is explicitly installed/snapshotted into a project. Cache keys include project and version/digest. |
| API keys and service principals | User keys have explicit allowed project IDs and action restrictions. Worker/service identity has allowed projects, runtime ID and operation capabilities. Global bootstrap secrets do not become tenant credentials. |
| Session/OIDC tables | Persistent browser session/revocation state; one-use OIDC login state with expiration, PKCE verifier and nonce protected at rest; external identity unique `(issuer,subject)` linked deliberately to a User. Root identity workstream owns detailed fields. |
| `WorkflowRun` | One-to-one Execution; project, immutable definition snapshot/digest, interpreter version, state, desired state, owner ID, monotonically increasing epoch, lease expiry, next wake time, deadline, version counter. |
| `WorkflowStep`, `StepAttempt` | Stable node key; parent/dependencies; persisted resolved input/digest and branch decision; current state. Attempts include ordinal, operation ID, role/unit, command state, accepted epoch, output/error, artifact reference, timestamps. Unique run+node+attempt; results are immutable after acceptance. |
| `WorkflowUnit`, `RuntimeCommand` | Persist runtime/worker/thread/container identity and role instance. Command has globally unique operation ID, project/run/attempt, kind, immutable payload digest, target identity, owner epoch, state, result receipt and dispatch/reconciliation times. Payload stores credential references, not tokens. |
| `Artifact`, `VerificationRecord` | Project, content digest, validated manifest/storage key, size, format version; verification binds artifact digest, policy digest, verifier image digest, command/exit/evidence, status and operation ID. |
| `ApprovalRequest`, `ApprovalDecision` | Project/run/step, candidate artifact+commit digest, policy version, required authority, expiry, pending/decided/invalidated state; decision actor, authenticated session, verdict and time. One accepted decision per request/version. |
| `PublicationOperation` | Unique project+run+candidate+target; expected base/target ref, frozen commit/tree, provider/repo/branch, PR marker and desired parameters; prepared/dispatched/confirmed/ambiguous/failed states, provider result/evidence. |
| `OutboxEvent`, `WebhookDelivery` | Event ID, project/execution, per-execution sequence, immutable payload, commit time; delivery endpoint reference, attempt count, next attempt, status and response classification. Unique endpoint+event delivery intent. |

Migration sequence: create one default tenant/project; backfill all existing resources and current users into it; backfill existing keys to that project; verify row counts and relationships; then enforce non-null/composite constraints and drop global Pattern-name uniqueness. Never infer customer assignment from email domain or repository name. Migration fixtures include old installations with zero users, multiple roles and orphaned historical references. Orphans must be classified explicitly before constraints are validated.

Keep schema migrations forward-compatible while application scope is being added. Do not run old unscoped application code against a database containing multiple tenants. Creation of a second tenant stays disabled until Wave C isolation tests pass.

### A2. Mandatory scope below the transport

Introduce a trusted `ProjectContext` containing principal ID/type, tenant/project ID, effective project role, key restrictions and authorization version. Resolve it from a current database membership lookup. A URL/header may select a project; it cannot grant membership. Legacy routes may choose the configured default project only after this same membership check.

Use `/api/projects/:projectId/...` and equivalent explicit gRPC metadata/request context. Keep compatibility routes delegating to the same scoped service. Carry scope through PatternEngine, persisted workflows, runtime dispatch, event streams, workspace preparation and credential issuance. Repository read/write methods require scope and use `(projectId,id)` or `(projectId,name)` predicates. Generic global repositories are reserved for a small named platform-administration path; no optional project filter in normal request handling.

Protect database reads again with project row policies once scoped transaction plumbing is in place. Set the project with transaction-local state on the same connection as the query; application connections must not own the tables or have BYPASSRLS. Never leave project state on a pooled connection. Migration and global operational roles are separate. PostgreSQL's row-security bypass behavior must be covered by role-level integration tests. [PostgreSQL row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

Project admins manage project membership. They cannot reset another global user's password, alter global account status/platform role, link an OIDC identity, or administer another tenant. Global `/users`, backup, installation, license and platform audit operations require platform authority. Self-service account changes require the authenticated user and appropriate reauthentication. Removing membership revokes its current access even if an older token contains an admin claim.

Scope all memory candidates before ranking or pooling, registry keys before agent selection, SSE/WS/gRPC snapshots and replay before delivery, and workspace/grant lookup before returning paths or minting credentials. Bind repository installation IDs and allowed repos to the tenant/project. A provider installation being accessible to the platform does not authorize every project to use it. Cache/filename/object-storage prefixes include project identity; global worker lookup is never user-readable.

### A3. Identity and browser boundary

Use the root's maintained `openid-client` v6 design: authorization code+PKCE+nonce, persisted one-use login state, verified issuer/subject, explicit identity linking, session revocation, HttpOnly browser sessions and CSRF defenses. User email alone does not link accounts. Validate project membership on use; browser and API credential capabilities remain distinct. SDKs support explicit project selection and credential rotation without sending secrets in URLs.

Acceptance: two tenants with identical pattern/repo/role names cannot observe or mutate one another through HTTP, gRPC, runtime dispatch, events, history, workspaces, grants, schedules or triggers. A project admin in A cannot reset a global account that also belongs to B. Concurrent pooled DB transactions with different project contexts never cross-read; missing context fails closed. Existing default-project fixtures retain their intended access after migration. Real loopback OIDC tests cover state reuse, bad nonce/issuer, revoked sessions and CSRF failure.

## Wave B — durable coordinator, worker contract and verified publication

### B1. Persisted interpreter and ownership

Create `src/durable/` with a coordinator, repositories/contracts, interpreter, recovery scanner and outbox publisher. Route durable org-pattern requests from both HTTP and gRPC through one submission service. The submission transaction pins the normalized definition and runtime requirements, creates Execution/WorkflowRun/initial steps and appends the started event. The HTTP response acknowledges durable acceptance, not worker completion.

Compile stable node keys from definition paths. Sequential nodes enable the next child only after the previous terminal success. Parallel nodes persist independent children and their join; lease-guarded reservations enforce the persisted concurrency limit. Condition decisions, selected agent/unit and resolved inputs are stored before dispatch. Deterministic aggregation recomputes only from committed child results. Agent assign/review, retries, supervisor corrections and command verification each receive distinct persisted attempts; a recovery resend retains the same operation ID and payload. Existing agent `approve` remains explicitly agent review; new `humanApproval` waits for an authenticated decision.

Claim runnable runs in short transactions with row locks. Claim increments epoch and records owner/expiry using database time. Every transition, command creation, heartbeat, result acceptance and outbox append compares project, run, owner, epoch, unexpired lease and expected state/version. Zero affected rows means stop scheduling immediately. No network call runs inside the transaction. A disconnected coordinator fails closed rather than continuing from cached ownership.

Recovery claims an expired run into `reconciling`, then negotiates a fence with each involved worker. It inspects every nonterminal command before enabling successors. A confirmed completed operation records its existing result once; a known running operation is reattached; a proven never-accepted operation may be submitted under the same operation ID only to a worker that guarantees deduplication. Unknown/contradictory identity, lost workspace, missing receipts or an unsupported worker stops automatic progress with reconciliation details. Do not repoint an old command to a new worker and assume it was never executed.

Cancellation is a durable desired-state request accepted on any coordinator. API returns `202 cancellation_requested` until all required stop receipts are confirmed, then terminal cancelled; unknown worker state becomes reconciliation-required failure. The coordinator repeatedly observes the signal across restart. Publication already dispatched cannot be recalled: preserve the publication conflict/reconciliation behavior. Timers are persisted absolute deadlines; a restart does not reset task timeout.

Persist step/result transition and outbox event in the same transaction. Subscribers read committed events with an ordered cursor; the in-memory bus only prompts a read. SSE supports replay after a sequence cursor and gives an explicit retention-gap response. Webhook deliveries are at-least-once with stable event/delivery IDs, bounded retries and dead-letter state. No exactly-once delivery claim.

### B2. Versioned durable runtime contract — required for automatic resume

Add these proposed interfaces to `packages/runtime-interface`; implement and test them before enabling capability advertisement:

| Operation | Required guarantee |
|---|---|
| `capabilities()` | Versioned `durableOperations`, `executionFencing`, `operationLookup`, `inventory`, `eventReplay`, `artifactExport`, `cancellation` with actual supported semantics. Reject unsupported durable jobs before spawning. |
| `fenceExecution(projectId,executionId,epoch)` | Authenticate project-bound worker identity; durably record highest accepted epoch, reject lower epochs, and acknowledge only after previous epoch admission is closed. New coordinator schedules no work before this acknowledgement. |
| `submitOperation(envelope)` | Envelope includes project/execution/node/attempt/operation IDs, epoch, payload digest, deadline, policy and artifact references. Persist receipt before dispatch. Same ID+digest returns the same receipt/result; same ID+different payload fails. |
| `getOperation(operationId)` / `listExecutionOperations()` | Return durable accepted/running/completed/stopped/unknown state, receipt, result/artifact digest, observed epoch and runtime generation. An in-memory 404 is not proof that work never ran. |
| `cancelOperation(operationId,epoch)` | Stop only the bound operation; acknowledge the actual stop result. Unknown/lost worker state is explicit. |
| `eventsAfter(cursor)` | Stable operation event IDs/sequences; duplicates are tolerated and deduplicated. Report gaps, do not synthesize success. |

Implement first in the Docker runtime using a worker-owned durable receipt store and deterministic container names/labels keyed by operation ID. Receipt state is written before container creation; after a crash, inspect that exact container identity and reconcile create/start/output/exit. Stable output artifacts and exit receipts are committed before reporting completion. A missing container after an uncertain start is `unknown`, not a license to launch a second one. The worker journal must outlive the runtime process and include its generation; container deletion waits until completion receipt/artifact retention is satisfied.

The existing gateway protocol needs explicit fence/receipt/lookup/inventory/replay messages and project-bound worker sessions to claim these capabilities. Hello must reconcile claimed thread IDs with the authenticated worker and persisted assignments; one agent cannot complete another worker's pending request. Legacy clients fail capability negotiation for durable workflows. Do not claim that deduplicating a message before writing stdin makes the stdin side effect atomic. Such a delivery remains ambiguous after a worker crash unless the executor supplies a durable turn/result protocol.

Leases and worker fences prevent stale coordinators from admitting new managed commands after a successful fence. They cannot undo a previously admitted agent's unrestricted external effects. Production task policies therefore remove publishing credentials and unrestricted network access from execution/verifier containers; designated publication code owns repository writes. If an old worker cannot be fenced or reconciled, the run stays parked.

### B3. Immutable artifacts, verification, human approval and publication

Use the root's artifact/verifier design: a bounded file manifest with validated relative paths, file modes, file sizes/content hashes and tree digest; reject symlinks/devices, traversal, duplicate/case-colliding paths and reserved `.git` content. Store objects privately under project+digest. Never accept arbitrary job host paths, Docker mounts, images, privileges or environment. The worker owns its Docker socket; the control plane does not. Registered verification policy selects a pinned image, no network, nonroot, read-only root, dropped capabilities, resource/output/wall limits and cancellation that kills the container.

A final candidate freezes all files to be published, including tracked modifications, deletions, executable modes and permitted new files. Construct a Git tree from the manifest without workspace hooks or content filters, verify it matches the candidate digest mapping, and create the immutable commit against the recorded base commit. Store the commit metadata once so replay does not produce a different SHA. Do not verify the old HEAD while pushing unchecked dirty files. Remote workspaces must export this artifact through a verified runtime capability; unavailable export blocks verification/publication.

Verification records bind candidate digest, policy digest, image digest, oracle outcomes and operation ID. The final publication gate requires passing current required checks and an unexpired authenticated human approval for that exact artifact/commit, repository, target branch and publication policy. Changing files, target, policy or candidate invalidates the approval. Project-authorized API decisions survive restart; agent text and direct thread stdin cannot satisfy this gate. An execution lease is released while waiting for a person and reacquired for continuation.

Replace durable-path calls to `WorkspaceService.finalize` with a `PublicationService` that reconstructs project/workspace metadata from persistence and publishes only the recorded immutable commit. Before any provider call, durably prepare the PublicationOperation and its expected remote state. Use a run/candidate-specific branch; never overwrite an unrelated remote ref. Query existing branch SHA and PR identity using the documented provider APIs; compare full repo/head/base/candidate marker, not title alone. [GitHub reference API](https://docs.github.com/en/rest/git/refs#get-a-reference), [GitHub pull-request API](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests)

If the worker or provider response is lost after dispatch, set `ambiguous`. Read-only reconciliation may confirm an exact matching effect. An absent PR response/list result does not prove a timed-out create cannot still finish: do not automatically create another PR. Conflicting refs, multiple matches or uncertain provider state require an audited operator reconciliation decision. Keep push and PR creation as separate operation states. A repeated safe ref operation targets the same immutable SHA; no provider-level idempotency API is assumed. Publishing remains a managed external effect with explicit uncertainty, not a global exactly-once promise.

## Work allocation and file ownership

With three implementers, use these boundaries. Finish each wave's contracts before consumers edit integration files; one owner applies migrations and generated Prisma changes.

| Wave/workstream | Owned files | Dependencies/handoff |
|---|---|---|
| A data/project foundation | `prisma/schema.prisma`, new migrations, `src/db/**`, new `src/projects/**`, repository scope types | Publish schema/context contracts first; coordinate identity table fields with A identity owner. |
| A identity/session | `src/auth/**`, `src/api/{auth,users}.ts`, OIDC/session services, dashboard auth/session transport | Uses project/membership contract; never grants platform authority from a tenant role. |
| A scoped edges | Remaining `src/api/**`, `src/grpc/services/**`, registry keys, schedules/triggers, SDK/CLI project transport, memory/workspace scope call sites | Uses A data contracts; PatternEngine interface/scope integration assigned here during A only. Server wiring has one designated integrator. |
| B coordinator | New `src/durable/**`, PatternEngine integration, declarative interpreter, resilience wiring, event replay/outbox APIs | Consumes frozen A schema and B worker/artifact/publication contracts; owns org workflow changes. |
| B worker/artifacts | Runtime interface/clients, Docker durable adapter/journal, artifact store, verifier service, gateway protocol capability/receipt handling | Supplies fake adapter early, real Docker contract tests before capability enablement. No changes to coordinator internals. |
| B approval/publication | New approval/publication services and HTTP/dashboard flows; workspace/provider adapter; credential issuance enforcement | Uses artifact/verification tables and worker export contract; sends durable approval signal through coordinator API. No direct workflow state edits. |
| C verification/rollout | Isolated DB/container/process tests, route isolation matrix, deployment configuration/docs | Independent of feature authors; fixes returned to owning workstream. |

Integration files (`server.ts`, `PatternEngine` interfaces, shared SDK/proto generation, package/lockfiles) get one named owner in each wave. Agents propose contract changes to that owner instead of editing the same file concurrently. A second project remains disabled until all scoped edges are wired and verified.

## Wave C — decisive acceptance tests and rollout

1. **Coordinator restart:** run a two-step declarative job with a real durable worker and isolated PostgreSQL. Kill coordinator after first dispatch, after worker completion but before result commit, and after result commit but before successor scheduling. Restart another coordinator. Assert one accepted operation per attempt, retained first result and exactly one scheduled successor. Include sequential, parallel join and a persisted condition decision.
2. **Lease/fence split brain:** pause coordinator A beyond its lease; B claims a higher epoch and fences the worker. Resume A. Reject its DB transitions, submissions, result writes and credential/publication requests. If worker fencing cannot be confirmed, B performs no new dispatch.
3. **Worker ambiguity:** crash around receipt/create/start/exit/result persistence and reconnect with inventory. Reattach identifiable running containers; recover durable results; park absent/contradictory operations. Test mismatched operation payload, identity impersonation, duplicate/out-of-order events and replay gaps.
4. **Durable cancellation/approval:** accept cancellation on the non-owning node, restart before stop acknowledgement, and finish only from a confirmed stop receipt. Persist a human approval wait across restart. Reject agent prose, stale candidate approval, revoked membership, self-approval where prohibited, reused decision IDs with changed payload and approval after cancellation.
5. **Verifier/artifact boundary:** real Docker tests prove host secrets/socket are absent, network/capabilities/resources match policy, failing exit cannot pass, cancellation removes the verification container, output is bounded and manifest tampering/traversal/symlink payloads fail. Changing any candidate file invalidates verification and approval.
6. **Publication uncertainty:** a fake provider applies push or creates PR and then drops the response. Restart before/after local confirmation. Reconcile the exact positive result without a second create; absent/contradictory state stays ambiguous. Verify the published commit's tree equals the approved artifact, including dirty/untracked/deleted input files. No real remote push is required for these tests.
7. **Isolation matrix:** exercise A/B tenants over every route/RPC, list/detail/stream/replay, file pattern cache, worker/agent inventory, memory history/pooling, credentials, artifacts and schedules/triggers. Run with same logical names and shared users. Test project-admin global-account takeover denial and project-context changes on pooled connections.
8. **Outbox and migration:** crash between transition/event/delivery stages; prove atomic state+event commit and stable delivery IDs under retries. Test upgrade from populated pre-project schema in an isolated DB, disabled-project behavior, retention gaps and rollback compatibility. No migration runs against the user's running database.

Release evidence must name which runtime/protocol versions passed automatic recovery tests. Ship durable execution as an explicit mode/capability until representative jobs pass these kill/restart tests. Rollout documentation covers separate migration/application DB identities, private artifact storage and quotas, worker journal persistence, key/session rotation, lease tuning, recovery ownership, unresolved publication handling and backup/restore verification. Keep legacy nonresumable behavior visible in API/UI and retain the ability to drain workers before rollback.

This plan supplies the persistence and isolation boundaries for the authorized continuation. It does not substitute for later deployed-cluster load testing, disaster-recovery exercises, provider-specific operational validation or proof that arbitrary third-party agent effects are idempotent.
