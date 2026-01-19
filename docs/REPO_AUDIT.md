# Parallax Repo Audit (Draft)

This audit captures the current state of the Parallax repository, highlights gaps/partials, and lists cleanup candidates. It is intended as a living reference for consolidation before the “golden ticket” demo work.

## 1) Architecture Snapshot

**Core layers**
- **Control Plane**: pattern engine, runtime manager, API services, registry + execution orchestration.
- **Data Plane**: agent proxy, confidence tracking, execution routing.
- **Runtime**: Prism execution + orchestration context.
- **Pattern SDK**: YAML requirements → pattern generation, primitives, validation.
- **SDKs**: TypeScript, Python, Go, Rust.
- **CLI**: operational commands, pattern management, scenario compile/run.
- **Observability**: telemetry + monitoring integrations.

**Source of truth docs**
- `ARCHITECTURE.md` (primary system model)
- `ARCHITECTURE_V2.md` (pattern generation + future architecture)
- `ROADMAP.md` (feature status)
- `docs/DOC_README.md` (doc index)

## 2) Packages Overview

**Core**
- `packages/control-plane`: API services, pattern engine, runtime manager.
- `packages/data-plane`: agent proxy + confidence tracker.
- `packages/runtime`: shared runtime core.
- `packages/primitives`: orchestration primitives.
- `packages/pattern-sdk`: requirements loader + generator + validator.

**Tools**
- `packages/cli`: main Parallax CLI.
- `packages/telemetry`, `packages/monitoring`, `packages/security`, `packages/auth`, `packages/tenant`.

**SDKs**
- `packages/sdk-typescript`
- `packages/sdk-python`
- `packages/sdk-go`
- `packages/sdk-rust`

## 3) Apps Overview

Apps are largely demo or integration drivers:
- `apps/demo-*` (language demos)
- `apps/pattern-demo`, `apps/simple-demo`, `apps/full-system-demo`
- `apps/web-dashboard` (UI)

These are good for showcasing but create documentation sprawl; consider consolidating into a single “demo gallery.”

## 4) Documentation Inventory

**Primary docs**
- Root: `README.md`, `ARCHITECTURE.md`, `ARCHITECTURE_V2.md`, `ROADMAP.md`
- Docs index: `docs/DOC_README.md`
- Onboarding: `docs/STARTUP_GUIDE.md`, `GETTING_STARTED.md`, `docs/QUICK_REFERENCE.md`
- Production: `PRODUCTION_DEPLOYMENT_CHECKLIST.md`, `docs/PRODUCTION_CHECKLIST.md`, `PRODUCTION_TEST_STATUS.md`, `PRODUCTION_TEST_RESULTS.md`, `docs/PRODUCTION_TESTING_GUIDE.md`
- SDK/testing: `SDK_TEST_SUMMARY.md`, `docs/SDK_TESTING_GUIDE.md`, `docs/SDK_TEST_SPECIFICATION.md`, `TESTING_GUIDE.md`, `TESTING_QUICKSTART.md`

**Secondary docs**
- `docs/META_ORCHESTRATION.md`, `docs/PATTERN_SDK_ARCHITECTURE.md`, `docs/AUTO_PATTERN_GENERATION.md`
- `docs/PRISM_LANGUAGE_FEATURES.md`, `docs/prism-specs.md`
- `docs/observability/*`, `docs/security/*`, `docs/testing/*`

**Archive**
- `docs/archive/*` (historical/archived docs)

## 5) Duplication / Consolidation Targets

1. **Production docs**
   - `PRODUCTION_DEPLOYMENT_CHECKLIST.md` vs `docs/PRODUCTION_CHECKLIST.md`
   - `PRODUCTION_TEST_STATUS.md` + `PRODUCTION_TEST_RESULTS.md` vs `docs/PRODUCTION_TESTING_GUIDE.md`
   - Recommendation: consolidate into a single “Production Readiness” doc in `docs/production/` and link from root README.

2. **Onboarding docs**
   - `GETTING_STARTED.md`, `docs/STARTUP_GUIDE.md`, `docs/QUICK_REFERENCE.md`
   - Recommendation: make `docs/STARTUP_GUIDE.md` the primary and fold the rest into one short “Quick Start” section.

3. **Roadmaps**
   - Root `ROADMAP.md` + `docs/archive/IMPLEMENTATION_ROADMAP.md`
   - Recommendation: keep `ROADMAP.md` as source of truth; legacy roadmap is archived.

4. **Pattern generation docs**
   - `docs/PATTERN_SDK_ARCHITECTURE.md` + `docs/archive/PATTERN_GENERATION_ARCHITECTURE_GAP.md`
   - Recommendation: keep gap analysis archived (merged into PATTERN_SDK_ARCHITECTURE.md).

5. **Prism language docs**
   - `docs/PRISM_LANGUAGE_FEATURES.md` + `docs/prism-specs.md`
   - Recommendation: merge or clearly separate (spec vs user guide).

## 6) Partial Implementations (Resolved)

The following gaps were addressed:
- gRPC pattern upload implemented; pattern API now supports upload and reload.
- Coordinator streaming now returns best-effort updates; history endpoint returns in-memory entries.
- Registry watch implemented via polling with capability filters.
- WebSocket execution stream wired via `ws` upgrade handler.
- Data-plane agent proxy implements HTTP + gRPC execution paths.
- Tenant usage tracking is backed by an in-memory usage store with `recordUsage`.
- TypeScript agent streaming uses `streamAnalyze` with a default one-shot fallback.
- CLI client now uses HTTP control plane for patterns and execution.

Note: Go and Rust SDKs now use gRPC for pattern/registry operations; execution history APIs remain unsupported by gRPC and return explicit errors.

## 7) Safe-to-Delete Candidates (Review Required)

**Likely safe if not referenced**
- `docs/archive/*` (explicitly marked archived; only referenced by `docs/DOC_README.md`)
- `temp/` (if unused; check for scripts referencing it)
- Old demo apps if superseded (e.g., `apps/demo-*` duplicates)

**Needs confirmation**
- `PRODUCTION_TEST_STATUS.md` and `PRODUCTION_TEST_RESULTS.md`: are they still actively updated? If not, move into `docs/archive` and keep only a single current production guide.
- `SDK_TEST_SUMMARY.md`: if testing docs are maintained elsewhere, consider moving to archive.

## 8) Recommended Cleanup Plan

1. **Doc consolidation pass**
   - Create a “Doc Map” section in `docs/DOC_README.md` pointing to the new canonical docs.
   - Merge duplicates and archive the rest.

2. **Archive pruning**
   - Move long‑stale files to `docs/archive/` or delete if not referenced.
   - Keep `docs/archive/README.md` updated if you keep archive.

3. **Remove vestigial code**
   - Delete or stub TODO‑heavy code paths that won’t be used in demo.
   - Add “demo paths” in CLI that avoid unimplemented gRPC calls.

4. **Demo packaging**
   - Consolidate demo apps into a single “demo gallery.”
   - Provide a single `parallax demo` command.

---

## Confirm Before Deleting

If you want to delete files, confirm which categories are safe (archive docs, redundant demo apps, temp scripts). I can then remove them and update references.
