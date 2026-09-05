# Enterprise hardening implementation — September 4, 2026

This implements the immediate code-level fixes identified in the [enterprise readiness review](ENTERPRISE_READINESS_REVIEW_2026-09-04.md). That review describes the earlier `e3c98eb` baseline; its findings should be read alongside this implementation record. The project is substantially safer to evaluate in a dedicated environment, but this work does not establish enterprise production readiness.

## Delivered

| Area | Result |
| --- | --- |
| Account security | Authentication is independent of licensing. User mutations enforce self/admin boundaries; API-key scopes intersect current account permissions. Passwords use bounded asynchronous scrypt, with conditional migration of legacy hashes after successful login. First-admin setup requires a production bootstrap token and serializes concurrent registration in PostgreSQL. |
| Transport security | HTTP routes have a default-deny authorization policy. Execution WebSocket upgrades, all gRPC methods/streams, and runtime HTTP/WebSocket APIs require their appropriate credentials. Production gRPC requires TLS; invalid configured TLS fails startup. Unauthenticated development modes require nonproduction loopback listeners. |
| Client compatibility | TypeScript/Python SDKs propagate gRPC metadata and validated client TLS settings. CLI HTTP/WebSocket requests carry account credentials. Dashboard setup supports the bootstrap token and thread events use authenticated streaming fetch with shared token refresh. Python registration rejection closes the listener; shutdown uses the actual unregister protocol and closes its channel. |
| Verification | Required checks have explicit passed/failed/unavailable/inconclusive outcomes. Unknown configurations, broken reviewers, rejected review gates, and nonzero command results cannot become successful verification through a numeric score. Supervisor corrections rerun the original checks. Local shell verification is explicitly opt-in and forbidden in production. |
| Execution control | One execution ID follows persisted and running work. Cancellation/timeouts abort scheduling, suppress late results, reconcile late spawns, and require acknowledged cleanup within a bounded deadline. Incomplete cleanup persists a failed outcome and emits the failure event. Requested publication failures fail the job; publication already in progress rejects cancellation and requires reconciliation after a timeout. Terminal database updates use conditional transitions, execution streams filter events by owned threads, and HA recovery no longer marks all active work as orphaned. |
| Runtime behavior | Local threads propagate approval presets and default to `standard`. Unsupported policies are rejected. Context-file preparation rejects traversal and existing or dangling symlinks. Cleanup stops owned workers before deleting execution resources, propagates failures, and uses full-ID-derived resource names. Docker/Kubernetes transports explicitly reject unsupported remote thread contracts. |
| Build and deployment | Node 24, pinned package/build tools, isolated PostgreSQL/etcd tests, locked Python SDK tests, same-revision release checks, required Secret/TLS configuration, and unsafe-chart configuration tests replace several permissive defaults. The high/critical dependency audit is a failing release gate until findings are remediated. No environment was deployed. |

## Setup changes that require attention

- Existing callers must now authenticate. Provision separate JWT-signing, trusted gRPC-service, runtime-service, and initial bootstrap secrets; never put service/signing keys in browser code or patterns. Production needs valid gRPC certificates and HTTPS ingress. See [security configuration](SECURITY_CONFIGURATION.md), [client setup](CLIENT_SECURITY_SETUP.md), and [deployment configuration](DEPLOYMENT_HARDENING.md).
- Production command verification requires an operator-provided isolated `commandVerifier` integration. This patch supplies its contract and fail-closed behavior, not a deployed verification worker. Unsupported oracle configurations and missing evidence now stop workflows. See [verification behavior](VERIFY.md).
- Drain existing workers before upgrading runtimes/controllers together. Old shared-auth resources use a different naming scheme and need deliberate cleanup after their workers stop. Remote Docker/Kubernetes thread workflows are unavailable until their event/preparation contract is implemented. See [runtime contracts](RUNTIME_SECURITY.md).
- Cancellation cannot undo an external push or pull-request request already sent. The API reports that boundary rather than acknowledging a stop it cannot guarantee. Cross-node cancellation and process-crash recovery still require reconciliation. See [execution lifecycle](EXECUTION_LIFECYCLE_HARDENING.md).
- Password-reset email delivery remains unavailable and now reports that explicitly. Existing refresh tokens are not revoked by password changes or client-side logout. Previously persisted credential-bearing metrics and a previously committed license credential were not rewritten in history; rotate affected credentials and plan data cleanup separately.

## Verification evidence

Independent final checks completed after the review corrections, using Node.js 24.20.0 and pnpm 10.11.0 unless noted:

| Check | Evidence |
| --- | --- |
| Workspace build and types | All 25 build tasks passed (11 rebuilt; 14 unchanged tasks reused their verified cache). All 21 workspace typecheck tasks passed without cache hits. |
| Control-plane unit tests | All 411 tests across 31 files passed, including verification failure, cancellation/publication races, bounded cleanup, authentication, and execution stream ownership regressions. |
| Real database/HTTP integration | 55 tests across six files passed against newly created disposable PostgreSQL 16/etcd infrastructure. Every migration was applied; tests covered concurrent first-admin creation and competing terminal transitions. Only the test-created resources were removed. |
| Runtime tests | Local runtime: 85 passed. Docker runtime: 82 passed. Kubernetes runtime: 122 passed. These include authenticated HTTP/WebSocket boundaries and unsupported-capability rejection; the local suite includes dangling-symlink preparation rejection. |
| TypeScript and browser clients | TypeScript SDK: 24 passed. Management client: 140 passed. CLI authentication: 1 passed. Dashboard authentication/streaming: 4 passed. |
| Python SDK | All 31 tests passed in an isolated Python 3.11 environment using the exact new CI dependency/test commands: Poetry 1.8.2, `poetry install --with dev --sync --no-interaction`, then `poetry run pytest -q`. This covers real loopback execution streams, registry authentication/unregistration, and rejected-key startup cleanup. One existing test-helper collection warning remains. |
| Changed-file static review | New lint errors and import-order errors found during review were corrected. The final formatter-disabled check still reports seven existing errors: four implicit-any declarations, two workflow DSL `then` properties, and one asynchronous Promise executor. Existing warnings and repository formatting debt remain. `git diff --check` passed. |
| Deployment configuration | GCP Helm rendering/strict lint, Secret/TLS references, and six unsafe-configuration rejection checks passed. Changed workflow files parsed successfully as YAML. Earlier secret/certificate preflight checks also passed. |

The final suites passed **955 tests** in total. Local build/test success does not imply green remote CI: the existing lint debt and dependency audit gate remain unresolved. These tests do not exercise a live cloud rollout, actual LLM work through a remote runtime, multi-node network partitions, or an external publication provider.

## Remaining enterprise work

1. **Durable execution and publication:** persisted workflow state, durable signals, owner leases/fencing, idempotent external actions, transactional event delivery, restart reconciliation, and tested failover. The current conservative recovery fails orphaned work; it does not resume it.
2. **Customer isolation:** tenant/project ownership in records, memory, workspaces, queues, and authorization; separate worker identities and a real sandbox. Shared service keys and local host-user workers are suitable only inside a trusted, dedicated boundary.
3. **Trusted acceptance evidence:** a deployed isolated verifier, immutable candidate digests, retained logs, trusted test policy, final combined-artifact verification, and authenticated human approval tied to a specific candidate. An agent's approval remains an agent decision.
4. **Enterprise identity and operations:** SSO/SCIM, refresh-token rotation/revocation, protected browser sessions, durable audit coverage, secret rotation, backup/restore drills, SLOs, capacity limits, and alerting. Thread streams also need replay across disconnects.
5. **Dependency remediation:** the production workspace audit reported **4 critical, 101 high, 132 moderate, and 18 low findings**. These counts include docs/demo/app dependency trees and are not a count of exploitable vulnerabilities in a deployed image. They require ownership, runtime reachability assessment, targeted upgrades, and image scanning. The release audit gate intentionally remains blocked while high/critical findings exist.

The appropriate next milestone is a validated pilot for one customer/security boundary with an isolated worker and a rehearsed operating procedure. Shared-customer hosting and unattended enterprise guarantees need the remaining architecture and operational work above.
