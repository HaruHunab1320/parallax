/**
 * File Change Checker
 *
 * Uses the GitHub API to check if any watched source files changed between
 * two version tags. This enables targeted adapter validation — when a new CLI
 * version is released, only the files that matter for prompt/auth/ready/exit
 * detection are checked.
 */

import type { AdapterType, FileChangeResult, WatchedFile } from './types';
import { WATCHED_FILES, getWatchedFiles } from './watched-files';

/** GitHub compare API response shape (subset) */
interface GitHubCompareResponse {
  files?: Array<{
    filename: string;
    status: 'added' | 'modified' | 'removed' | 'renamed';
  }>;
  status: string;
  ahead_by: number;
  behind_by: number;
  total_commits: number;
}

/**
 * Build GitHub headers with optional token for higher rate limits.
 */
function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * Normalize a version string to a tag name.
 * Tries common patterns: v1.2.3, 1.2.3, aider-1.2.3, etc.
 */
function normalizeTag(version: string, adapter: AdapterType): string {
  // If it already looks like a tag (starts with v, or contains adapter name), use as-is
  if (/^v\d/.test(version) || version.includes('/')) {
    return version;
  }
  // For aider, tags are like "v0.82.0"
  // For most repos, tags are "v1.2.3"
  return `v${version}`;
}

/**
 * Check which watched files changed between two versions of a CLI.
 *
 * Uses the GitHub compare API:
 *   GET /repos/{owner}/{repo}/compare/{base}...{head}
 *
 * @param adapter - The CLI adapter to check
 * @param oldVersion - Previous version (e.g. "1.2.3" or "v1.2.3")
 * @param newVersion - New version to compare against
 * @returns FileChangeResult with matched watched files that changed
 */
export async function checkFileChanges(
  adapter: AdapterType,
  oldVersion: string,
  newVersion: string,
): Promise<FileChangeResult> {
  const config = getWatchedFiles(adapter);
  const { githubRepo, watchedFiles } = config;

  const oldTag = normalizeTag(oldVersion, adapter);
  const newTag = normalizeTag(newVersion, adapter);

  const url = `https://api.github.com/repos/${githubRepo}/compare/${oldTag}...${newTag}`;

  const response = await fetch(url, { headers: githubHeaders() });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Tags not found: ${oldTag}...${newTag} in ${githubRepo}. ` +
        `Check that both version tags exist.`,
      );
    }
    throw new Error(
      `GitHub API error for ${githubRepo}: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as GitHubCompareResponse;
  const changedFilenames = new Set(data.files?.map((f) => f.filename) ?? []);
  const fileStatusMap = new Map(data.files?.map((f) => [f.filename, f.status]) ?? []);

  // Match watched files against changed files
  const changedWatchedFiles: FileChangeResult['changedFiles'] = [];

  for (const watched of watchedFiles) {
    if (changedFilenames.has(watched.path)) {
      changedWatchedFiles.push({
        path: watched.path,
        category: watched.category,
        status: fileStatusMap.get(watched.path) as FileChangeResult['changedFiles'][0]['status'],
      });
    }
  }

  // Determine if adapter update is needed based on which categories changed
  const criticalCategories = new Set(['blocking_prompt', 'ready_detection', 'auth', 'exit_detection']);
  const adapterUpdateNeeded = changedWatchedFiles.some((f) => criticalCategories.has(f.category));

  // Build human-readable summary
  const summary = buildSummary(adapter, oldVersion, newVersion, changedWatchedFiles, data.total_commits);

  return {
    adapter,
    oldVersion,
    newVersion,
    changedFiles: changedWatchedFiles,
    adapterUpdateNeeded,
    summary,
  };
}

/**
 * Check file changes for all adapters between version pairs.
 */
export async function checkAllFileChanges(
  versionPairs: Partial<Record<AdapterType, { old: string; new: string }>>,
): Promise<FileChangeResult[]> {
  const results: FileChangeResult[] = [];

  for (const [adapter, versions] of Object.entries(versionPairs)) {
    if (!versions) continue;

    try {
      const result = await checkFileChanges(
        adapter as AdapterType,
        versions.old,
        versions.new,
      );
      results.push(result);
    } catch (error) {
      console.error(`Error checking ${adapter}:`, error);
    }
  }

  return results;
}

/**
 * List all watched files for an adapter, grouped by category.
 */
export function listWatchedFiles(adapter: AdapterType): Record<string, string[]> {
  const config = getWatchedFiles(adapter);
  const grouped: Record<string, string[]> = {};

  for (const file of config.watchedFiles) {
    if (!grouped[file.category]) {
      grouped[file.category] = [];
    }
    grouped[file.category].push(file.path);
  }

  return grouped;
}

/**
 * Build a human-readable summary of file changes.
 */
function buildSummary(
  adapter: AdapterType,
  oldVersion: string,
  newVersion: string,
  changedFiles: FileChangeResult['changedFiles'],
  totalCommits: number,
): string {
  const lines: string[] = [];

  lines.push(`${adapter}: ${oldVersion} → ${newVersion} (${totalCommits} commits)`);

  if (changedFiles.length === 0) {
    lines.push('  No watched files changed — adapter patterns likely still valid.');
    return lines.join('\n');
  }

  lines.push(`  ${changedFiles.length} watched file(s) changed:`);

  // Group by category
  const byCategory = new Map<string, typeof changedFiles>();
  for (const file of changedFiles) {
    const existing = byCategory.get(file.category) ?? [];
    existing.push(file);
    byCategory.set(file.category, existing);
  }

  for (const [category, files] of byCategory) {
    lines.push(`    [${category}]`);
    for (const file of files) {
      lines.push(`      ${file.status}: ${file.path}`);
    }
  }

  const criticalCategories = new Set(['blocking_prompt', 'ready_detection', 'auth', 'exit_detection']);
  const criticalChanges = changedFiles.filter((f) => criticalCategories.has(f.category));
  if (criticalChanges.length > 0) {
    lines.push(`  ⚠  ${criticalChanges.length} critical file(s) changed — adapter update recommended.`);
  } else {
    lines.push('  Only framework/startup files changed — adapter update likely not needed.');
  }

  return lines.join('\n');
}
