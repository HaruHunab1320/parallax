# Execution lifecycle hardening

Implemented September 4, 2026. This is a reliability and cancellation improvement, not a durable workflow engine or distributed execution fence.

## Behavior

- Each execution has one canonical ID across HTTP creation, database ownership, pattern execution, workflow context, and managed work. Both synchronous and asynchronous HTTP paths persist the owning control-plane node and the resolved timeout.
- Cancellation aborts workflow dispatch, prevents subsequent orchestration/publication, stops owned managed agents/threads, reconciles pending spawns, and waits for cleanup before returning success. Failed or unresponsive cleanup records a terminal failed outcome, emits a failure event, and returns a reconciliation error rather than claiming that workers stopped. Cleanup operations have bounded waits, including direct `WorkflowExecutor` calls. Reachable workers are stopped while pending spawns are reconciled; a late spawn is stopped when it becomes reachable.
- Timeouts abort the execution instead of only abandoning its result. Timers and subscription listeners are cleared. Late module or agent results cannot replace cancelled/failed status.
- External publication is a critical section: once a push/PR request has started, cancellation returns HTTP 409 and explains that it cannot retract publication. A timeout during publication records that external effects may still complete and require reconciliation. A requested publication failure fails the execution for both module and org workflows and identifies the need to reconcile any external effects. Transient publication and cleanup tracking is released after terminal settlement.
- Per-execution thread streams validate the execution and reject filters naming another execution's threads. Gateway and runtime events must match server-owned thread membership before forwarding. Membership for newly spawned threads is resolved during streaming, asynchronous lookups preserve event order, and lookup failures drop the unverified event.
- Database terminal transitions use a conditional update from `pending` or `running`. A concurrent completion, cancellation, timeout, or orphan recovery cannot overwrite a terminal result. Events and completion webhooks are emitted only for accepted transitions in the HTTP persistence flow.
- HA leadership changes no longer sweep all active records. Recovery without confirmed dead owner IDs does nothing. Owner-scoped recovery excludes healthy peers and records without an owner. A recovered execution is marked failed; no claim of resumption is made.
- The timeout checker only fails work it can cancel on the current owner. Explicit timeout `0` remains unlimited. Graceful shutdown aborts remaining owned work before failing records.
- Execution metadata persists whitelisted timeout/stream settings. Runtime credentials are not copied into execution metrics.
- `PatternEngineServices.commandVerifier` and `setCommandVerifier` provide a seam for an isolated verification worker. `allowLocalCommandVerification` is an explicit trusted-development option; workflow verification still prohibits local shell verification in production. The server's development switch is `PARALLAX_ALLOW_LOCAL_VERIFICATION=true`.

## Limits and next steps

- A request to cancel an execution owned by another server returns HTTP 409. Distributed cancellation routing, durable signals, worker leases/fencing, and failover resumption still need implementation.
- Arbitrary deployed TypeScript pattern modules and already dispatched legacy remote RPCs cannot be forcibly interrupted in the control-plane process. Late results are ignored and orchestration stops, but externally initiated effects cannot be undone. Production workloads require isolated workers with a cancellable protocol.
- A publication request that has already crossed the external-service boundary cannot be recalled. Operators must inspect the repository/provider after a publication timeout. A durable publication job with an idempotency key and outcome reconciliation remains necessary.
- Runtime stop failures remain actionable errors. A process crash still requires reconciliation against running workers before retrying work. Proven-dead owner IDs must be established by the caller; heartbeat absence alone is not a safe fence.
- Database transition/event writes are not a transactional outbox. Guaranteed event and webhook delivery, record retention, and retry policies remain separate work.
- Existing historical execution metadata has not been rewritten. If older versions persisted runtime credentials in metrics, handle that through a reviewed credential rotation/data cleanup procedure.

## Verification

The initial lifecycle checks passed: 50 tests across eight suites, including preexisting pattern engine tests, cancellation and late-result races, worker stop failures and deadlines, late spawn reconciliation, publication conflict/timeout, synchronous and asynchronous HTTP persistence, concurrent terminal transitions, healthy-node protection, and unlimited timeouts. An independent adversarial review added coverage for failed cleanup persistence/events/webhooks, completion after cleanup acknowledgement, failed publication in both execution paths, bounded direct workflow cleanup with late-spawn reconciliation, and thread-stream ownership/order/disconnect behavior. The four affected review suites passed 63 tests. Control-plane TypeScript checking passed after the final implementation changes; final combined verification is recorded separately.

These checks use local process/HTTP tests and mocked runtime/database clients. A deployed cluster, real database contention, worker network partitions, external publication providers, and process-kill recovery have not been exercised by this patch.
