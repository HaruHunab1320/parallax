# Changelog

## 0.4.4

### Fixed

- Remove `--depth 1` from git clone commands in both `tryUnauthenticatedClone()` and `cloneRepo()`. Shallow clones caused "refusing to merge unrelated histories" errors when agents tried to merge or rebase, because the single-commit clone had no common ancestor with branches that had diverged. Workspaces now get full history so git operations (merge, rebase, cherry-pick) work correctly.

## 0.4.3 and earlier

- Initial releases (no changelog maintained).
