# Coding Swarm

**The flagship parallax demo.** Define an agent team as an org chart in
YAML; parallax spawns real CLI coding agents (Claude Code, Codex, Gemini)
into that structure, routes work through the hierarchy, and uses
per-response confidence to decide when to accept a result, retry it with a
critique, or escalate it to a supervisor.

Two acts, one topology:

| Act | Pattern | Hardware |
|-----|---------|----------|
| **1 — Laptop** | [`patterns/coding-swarm-local.org.yaml`](patterns/coding-swarm-local.org.yaml) | Architect + 2 engineers as local PTY threads on your machine |
| **2 — Fleet** | [`patterns/coding-swarm.org.yaml`](patterns/coding-swarm.org.yaml) | Architect on a Mac, 3 engineers on Raspberry Pis behind NAT (gateway mode) |

The YAML is the only thing that changes between a laptop and a fleet.

## Act 1 — Laptop quickstart (target: ≤ 10 minutes)

Prerequisites: Docker running, pnpm, and the `claude` CLI installed and
authenticated (`claude --version` works).

```bash
# 1. Boot the platform (etcd/postgres/redis via docker, control plane, dashboard)
pnpm install && pnpm build
pnpm start

# 2. Load the local swarm pattern
cp demos/coding-swarm/patterns/coding-swarm-local.org.yaml patterns/

# 3. Open the dashboard and watch the threads panel
open http://localhost:3002

# 4. Give the team a task
cd packages/cli && pnpm run cli pattern execute coding-swarm-local \
  --input '{"task": "Build a CLI tool that converts CSV to JSON with type inference"}'
```

What you should see:

1. Three Claude Code sessions spawn in local PTYs (visible under
   **Threads** in the dashboard).
2. The architect decomposes the task; two engineers implement subtasks in
   parallel.
3. **The money shot:** each engineer ends its turn with a
   `CONFIDENCE: <0.0-1.0>` line. Results below `0.6` are retried once with
   a critique; below `0.4` the result escalates to the architect, who
   reviews it and owns the final answer. Watch for `step_confidence`
   events on the execution timeline.
4. The architect reviews both implementations and produces the merged
   result.

### The confidence policy

Engineers in the local pattern carry:

```yaml
confidence:
  accept: 0.8          # done
  retryBelow: 0.6      # one retry with critique; the better attempt wins
  escalateBelow: 0.4   # architect (reportsTo) reviews and decides
```

This is enforced by the workflow executor (`step_confidence` events), not
by prompting alone — see `docs/REFOCUS.md` Workstream C2.

## Act 2 — The fleet

Same demo across real hardware: the architect runs on a Mac, three
engineers run on Raspberry Pis that connect *outbound* to the control
plane via the gateway (no inbound ports, works behind NAT).

- Pi provisioning: [`scripts/setup-pi.sh`](scripts/setup-pi.sh),
  health check: [`scripts/check-pi.sh`](scripts/check-pi.sh)
- Per-device config: [`config/*.env`](config/) (Echo = Mac architect;
  Vero/Sable/Silas = Pi engineers)
- Agent binary: [`coding-swarm-agent/`](coding-swarm-agent/) — connects
  via gateway, spawns CLI threads on-device, streams thread events back
- Console view: [`scripts/tmux-grid.sh`](scripts/tmux-grid.sh)

## Status — what is verified vs. in progress

This README is the spec; the table is the truth. Anything unchecked is not
yet demonstrable — do not present it.

- [x] Platform bring-up: `pnpm start` boots etcd + control plane (+
  dashboard)
- [x] Org-chart YAML loading and thread-backed workflow execution
  (integration-tested against a mock runtime)
- [x] Confidence policy enforcement in the workflow executor
  (retry/escalate/accept — unit-tested end to end)
- [x] `CONFIDENCE:` line parsing from real CLI agent output into thread
  turn completions — `parseConfidenceMarker` in `@parallaxai/confidence`,
  wired through the local runtime, the gateway agent, and the workflow
  executor's event extraction (both event shapes)
- [x] Platform bring-up wired for a laptop run: `PARALLAX_LOCAL_RUNTIME_URL`
  registers `runtime-local`; local agents inherit the host's authed Claude
  config (set `PARALLAX_ISOLATE_AUTH=1` only for the distributed case)
- [x] Local run reaches full workflow completion with **3 live Claude Code
  PTY sessions** — they spawn, boot past onboarding/trust/auth, the
  org-chart workflow executes every step, and it completes and cleans up.
  (Verified 2026-07-08; fixed 6 orchestration bugs to get here — see the
  commit.)
- [x] **Agent turn OUTPUT capture** — root-caused (2026-07-11) to three
  compounding bugs, all fixed and verified live (proof-of-work file
  written, 82k-char turn payload with `CONFIDENCE: 0.9` delivered):
  1. `pty-manager` ≤1.11 cleared the session output buffer *before*
     emitting `task_complete`, so the runtime's buffer read always saw
     `''` — fixed in pty-manager 1.12.0: the event now carries the turn
     output as its payload. (Requires the 1.12.0 npm publish.)
  2. `runtime-local` spawned agents with no approval preset, so Claude
     blocked forever on its file-edit permission menu at the first
     `Write` — now spawns with `approvalPreset: 'autonomous'` by default
     (`PARALLAX_APPROVAL_PRESET` overrides).
  3. `coding-agent-adapters` 0.16.4 passed a `--tools` flag Claude
     doesn't support, hanging the session — fixed upstream in 0.17.0;
     deps bumped.
  (The earlier "stream-json mode" theory was wrong — agents run the
  interactive TUI, and multi-line tasks deliver fine as a single paste.)
- [ ] Dashboard: threads panel + `step_confidence` events on the execution
  timeline verified against a live run
- [ ] Fleet run on Echo + Pis with the same verification
- [ ] 3-minute screen capture for the repo/site
