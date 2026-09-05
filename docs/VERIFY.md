# Verification-driven confidence

Updated 2026-09-04. Confidence is a signal for allocating review and repair
attention, not a calibrated probability of correctness. See
[CONFIDENCE.md](CONFIDENCE.md).

## Supported policy

The workflow executor implements role-level `command`, `agent`, and `history`
oracles. A role may declare one oracle, an array, or an object with `oracles`
and `combine: min`. Unknown types, unknown oracle fields, empty oracle arrays,
invalid values, unresolved reviewer roles, and unsupported combination modes
are rejected before agents are spawned. The compiler, YAML loader, and direct
workflow execution all apply the same verification validation.

`weighted`, `product`, `checklist`, `human`, and explicit `verify` workflow
steps are unsupported and rejected. They are future capabilities, not
configuration that silently passes.

```yaml
roles:
  engineer:
    reportsTo: architect
    verify:
      oracles:
        - type: command
          run: npm test
          cwd: '${input.workspace}'
          timeoutMs: 120000
        - type: agent
          role: reviewer
          rubric: Are the original requirements implemented and tested?
      combine: min
    confidence:
      accept: 0.8
      retryBelow: 0.6
      escalateBelow: 0.4
```

The command example requires a configured isolated verifier in production;
it does not imply the control plane has access to a worker's filesystem.

## Required evidence and advisory signals

Every oracle result carries `status`, `required`, `confidence`, and readable
`detail`. Workflow confidence events include the individual oracle results
and `requiredPassed` so consumers can distinguish a score from acceptance.

| Oracle | Required | Outcomes |
| --- | --- | --- |
| `command` | yes | `passed`, `failed`, `unavailable`, `inconclusive` |
| `agent` | yes | `passed`, `failed`, `unavailable`, `inconclusive` |
| `history` | no | `skipped` for the current-artifact gate; prior may still affect triage |

Every required oracle must pass. A failed, unavailable, or inconclusive
required check blocks successful completion independently of its numeric
confidence. A configured `failConfidence: 1`, a passing historical prior,
a supervisor's prose, or a high agent self-report cannot waive a failing
required check.

Oracles run sequentially in declaration order. Their numeric scores combine
by minimum. Historical results describe earlier executions; even when useful
for triage, they are not evidence that the current candidate passed checks.
A missing history store remains an optional neutral supplement.

Roles without `verify` retain the existing advisory confidence behavior.
Their self-reported confidence must not be displayed as verified evidence.

## Command oracle

```yaml
type: command
run: npm test
cwd: '${input.workspace}'
timeoutMs: 120000
passConfidence: 1.0
failConfidence: 0.0
scorePattern: '(\d+) passed, (\d+) failed'
```

A zero exit code passes unless the configured score parser reports failures
or cannot parse the expected result. A nonzero exit always fails, including
when a parsed score is 1. A configured score pattern must match two numeric
capture groups representing passed and failed counts; missing or invalid
counts make an otherwise successful command inconclusive. A positive partial
score can guide a retry but does not accept incomplete work.

Execution errors, timeouts, and malformed verifier responses are unavailable.
An explicitly configured working directory that fails variable resolution is
unavailable; it never falls back to the coordinator's directory.

Production execution requires an operator-provided `commandVerifier` callback
in `WorkflowExecutorOptions`. Programmatic `PatternEngine` integrations supply
`PatternEngineServices.commandVerifier` or call `setCommandVerifier` before
execution:

```typescript
commandVerifier(request: {
  executionId: string;
  role: string;
  command: string;
  cwd?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>
```

This is an integration contract, not a shipped remote command service. The
integration must select an isolated worker, resolve the role's workspace
when `cwd` is absent, reject paths outside that workspace, constrain the
command environment and network access, and stop execution on cancellation
or timeout. The executor enforces a deadline and forwards cancellation; an
integration that ignores that signal can continue external work and does
not satisfy this contract. Required checks fail when no integration exists.

For trusted local development only, explicitly set
`allowLocalCommandVerification: true` (the server opt-in is
`PARALLAX_ALLOW_LOCAL_VERIFICATION=true`). This option is refused when
`NODE_ENV=production`. The local helper passes only `PATH`, `LANG`, and
`TMPDIR` from the coordinator environment, bounds output, and kills its Unix
shell process group on cancellation or timeout. It is not a security sandbox:
it still runs with the operator's filesystem and network privileges.
Production must use the isolated integration even for apparently harmless
commands.

## Agent oracle and standalone review

```yaml
type: agent
role: reviewer
rubric: Verify the original requirements, composition, and tests.
```

The reviewer defaults to the role's `reportsTo` when `role` is omitted. It
must exist. The original task and reported result are included in the review
request. The protocol ends with explicit lines:

```text
VERDICT: approve
CONFIDENCE: 0.9
```

`approve` passes; `revise` and `reject` fail. A bare confidence marker, an
echo of `VERDICT: approve | revise | reject`, malformed output, or a failed
review turn cannot approve the work. The numeric confidence remains useful
for triage, with reject/revise scores capped to prevent contradictory high
scores from overpowering the verdict.

Standalone workflow `review` and `approve` steps also require an explicit
approve verdict. Rejection or unparseable output fails the workflow before
later steps run. The `approve` step is an **agent decision**, not an
authenticated human approval. Durable human approval with identity and
candidate revision remains unimplemented.

## Repair and escalation

Confidence policy may request one critique-driven retry, carrying failure
details, followed by at most one supervisor correction. Every changed
attempt is verified again with the original role's oracle configuration and
execution context. The executor never restores an earlier, higher score
while returning a later changed workspace.

A supervisor cannot waive required checks. After correction, all original
checks run again; unresolved required failures fail the workflow. An
unroutable required failure also fails instead of returning apparent success.
Roles with advisory history/self-report only retain advisory escalation.

Checks currently use mutable workspace paths and reported results. This
change does **not** provide revision-bound evidence, immutable test policies,
artifact storage, or guaranteed reviewer independence. Production acceptance
and publication still need candidate digests, trusted verifier policy,
retained logs, and invalidation whenever code changes. Sequential steps may
change earlier verified work; final verification of the combined candidate
remains necessary.

## Lifecycle and concurrency

`WorkflowExecutor.execute(pattern, input, { executionId, signal })` accepts a
canonical ID and cancellation signal. The supplied ID is reused for workers
and events. Cancellation stops scheduling, cancels waits and verifier
requests, and stops owned agents/threads. `cancelExecution(executionId)`
awaits owned-unit cleanup, including spawns that resolve after cancellation.
Cleanup errors remain visible to the cancellation caller. These are runtime
stop acknowledgements, not durable recovery records.

Successful workflows also stop owned units before reporting completion.
Agents must finish their work during awaited workflow steps. They must not
continue pushing code or creating pull requests after workflow completion.

`maxParallel` bounds active leaf steps, including their verification and
repair, across nested parallel and sequential containers. Containers do not
hold permits while waiting for children, avoiding nested parallel deadlocks.
An errored parallel branch cancels its siblings before workflow cleanup.
Bootstrap still provisions configured role instances up front; the leaf
limit is not a cap on total resident worker processes.

## Validation

The org-pattern test suites cover schema rejection before spawning,
required verification failure, supervisor reverification, unsupported
combination modes, missing/invalid reviewer outcomes, review/approval gates,
production local-command denial, isolated-verifier timeout/cancellation,
local child-process cleanup, nested concurrency, canonical IDs, cancelled
ready gates and turns, late spawns, and worker cleanup failures.

These tests use runtime doubles and a small trusted local command test.
They do not validate a deployed isolated verifier, an actual cluster,
revision-bound publication, or durable restart recovery.
