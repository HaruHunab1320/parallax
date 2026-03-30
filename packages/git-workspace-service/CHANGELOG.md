# Changelog

## 0.4.5 - 2026-03-30

### Fixed
- **Credential service made optional** — `WorkspaceService` now works without a `credentialService` (PAT-only mode). All credential service calls are null-safe, with direct PAT credential creation when no credential service is configured.

### Changed
- **Debug logging migrated to Pino** — `git-credential-helper.ts` and `device-flow.ts` now use structured Pino logging for debug/status output. `console.log` preserved for git credential protocol output (stdout) and interactive OAuth prompts.
- Biome linter applied (formatting normalization across all source files).

## 0.4.4

### Fixed

- Remove `--depth 1` from git clone commands in both `tryUnauthenticatedClone()` and `cloneRepo()`. Shallow clones caused "refusing to merge unrelated histories" errors when agents tried to merge or rebase, because the single-commit clone had no common ancestor with branches that had diverged. Workspaces now get full history so git operations (merge, rebase, cherry-pick) work correctly.

## 0.4.3 and earlier

- Initial releases (no changelog maintained).
