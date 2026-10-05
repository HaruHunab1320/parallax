# Dependency audit gate

CI fails a pull request when the production dependency graph has a high or
critical advisory that is not fixed and not documented.

## How it works

1. `pnpm audit --prod --json` lists advisories for everything reachable from
   a workspace package's `dependencies`. Dev-only tooling is excluded.
2. `scripts/audit/audit-gate.mjs` reads that report and `audit-allowlist.json`.
3. The gate fails when:
   - a high or critical advisory has no allowlist entry,
   - an entry's `revisit` date has passed,
   - an entry no longer matches any reported advisory (fixed upstream or the
     dependency was removed), or
   - an entry is missing its `id`, `package`, `reason` or `revisit`.

Run it locally with `pnpm audit:gate`. Its logic is unit-tested in
`scripts/audit/audit-gate.test.mjs`, which `pnpm verify` runs.

## Fixing an advisory

Prefer, in order: upgrading the direct dependency; a targeted
`pnpm.overrides` entry in the root `package.json` (scoped to the vulnerable
range, e.g. `"brace-expansion@<1.1.20": "1.1.21"`); removing or replacing the
dependency. Overrides are reviewed when the parent package ships the fix.

## Allowlisting an advisory

Only when no fixed version exists or the fix is not yet possible. Add an
entry with the GHSA id, the affected package, why the vulnerable code is not
reachable (or why the exposure is acceptable), and a revisit date no more
than about a month out. Never disable the gate or raise its threshold.

Current exceptions are in [`audit-allowlist.json`](../audit-allowlist.json).
