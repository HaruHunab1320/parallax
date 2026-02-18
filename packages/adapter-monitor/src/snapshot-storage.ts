/**
 * Snapshot Storage
 *
 * Stores and retrieves snapshots with version history.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  AdapterType,
  StartupSnapshot,
  VersionPatternMapping,
  AdapterVersionHistory,
  PatternDiff,
} from './types';
import { SNAPSHOT_PATHS } from './config';

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Save a snapshot to disk
 */
export async function saveSnapshot(
  snapshot: StartupSnapshot,
  baseDir: string = '.'
): Promise<string> {
  const filePath = path.join(baseDir, SNAPSHOT_PATHS.snapshot(snapshot.adapter, snapshot.version));
  const dir = path.dirname(filePath);

  await ensureDir(dir);
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));

  // Update latest symlink (or copy for Windows compatibility)
  const latestPath = path.join(baseDir, SNAPSHOT_PATHS.latest(snapshot.adapter));
  try {
    await fs.unlink(latestPath).catch(() => {});
    await fs.writeFile(latestPath, JSON.stringify(snapshot, null, 2));
  } catch {
    // Symlink/copy failed, that's ok
  }

  return filePath;
}

/**
 * Load a snapshot from disk
 */
export async function loadSnapshot(
  adapter: AdapterType,
  version: string,
  baseDir: string = '.'
): Promise<StartupSnapshot | null> {
  const filePath = path.join(baseDir, SNAPSHOT_PATHS.snapshot(adapter, version));

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as StartupSnapshot;
  } catch {
    return null;
  }
}

/**
 * Load the latest snapshot for an adapter
 */
export async function loadLatestSnapshot(
  adapter: AdapterType,
  baseDir: string = '.'
): Promise<StartupSnapshot | null> {
  const latestPath = path.join(baseDir, SNAPSHOT_PATHS.latest(adapter));

  try {
    const content = await fs.readFile(latestPath, 'utf-8');
    return JSON.parse(content) as StartupSnapshot;
  } catch {
    return null;
  }
}

/**
 * Extract patterns from a snapshot
 */
export function extractPatterns(snapshot: StartupSnapshot): VersionPatternMapping {
  const readyPatterns: string[] = [];
  const authPatterns: string[] = [];
  const blockingPatterns: string[] = [];
  const updatePatterns: string[] = [];

  for (const pattern of snapshot.patterns) {
    const text = pattern.text;

    switch (pattern.type) {
      case 'ready':
      case 'prompt':
        if (!readyPatterns.includes(text)) {
          readyPatterns.push(text);
        }
        break;
      case 'auth':
        if (!authPatterns.includes(text)) {
          authPatterns.push(text);
        }
        break;
      case 'blocking':
        if (!blockingPatterns.includes(text)) {
          blockingPatterns.push(text);
        }
        break;
      case 'update':
        if (!updatePatterns.includes(text)) {
          updatePatterns.push(text);
        }
        break;
    }
  }

  return {
    version: snapshot.version,
    firstCaptured: snapshot.timestamp,
    lastUpdated: snapshot.timestamp,
    readyPatterns,
    authPatterns,
    blockingPatterns,
    updatePatterns,
    snapshotFile: SNAPSHOT_PATHS.snapshot(snapshot.adapter, snapshot.version),
  };
}

/**
 * Load version history for an adapter
 */
export async function loadVersionHistory(
  adapter: AdapterType,
  baseDir: string = '.'
): Promise<AdapterVersionHistory> {
  const historyPath = path.join(baseDir, SNAPSHOT_PATHS.history(adapter));

  try {
    const content = await fs.readFile(historyPath, 'utf-8');
    return JSON.parse(content) as AdapterVersionHistory;
  } catch {
    // No history yet, return empty
    return {
      adapter,
      latestVersion: '',
      versions: {},
    };
  }
}

/**
 * Save version history for an adapter
 */
export async function saveVersionHistory(
  history: AdapterVersionHistory,
  baseDir: string = '.'
): Promise<void> {
  const historyPath = path.join(baseDir, SNAPSHOT_PATHS.history(history.adapter));
  const dir = path.dirname(historyPath);

  await ensureDir(dir);
  await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Update version history with a new snapshot
 */
export async function updateVersionHistory(
  snapshot: StartupSnapshot,
  baseDir: string = '.'
): Promise<AdapterVersionHistory> {
  const history = await loadVersionHistory(snapshot.adapter, baseDir);
  const patterns = extractPatterns(snapshot);

  history.versions[snapshot.version] = patterns;
  history.latestVersion = snapshot.version;

  await saveVersionHistory(history, baseDir);

  return history;
}

/**
 * Compare patterns between two versions
 */
export function comparePatterns(
  oldMapping: VersionPatternMapping,
  newMapping: VersionPatternMapping,
  adapter: AdapterType
): PatternDiff {
  const diff: PatternDiff = {
    adapter,
    oldVersion: oldMapping.version,
    newVersion: newMapping.version,
    added: { ready: [], auth: [], blocking: [] },
    removed: { ready: [], auth: [], blocking: [] },
    isBreaking: false,
    summary: '',
  };

  // Compare ready patterns
  for (const pattern of newMapping.readyPatterns) {
    if (!oldMapping.readyPatterns.includes(pattern)) {
      diff.added.ready.push(pattern);
    }
  }
  for (const pattern of oldMapping.readyPatterns) {
    if (!newMapping.readyPatterns.includes(pattern)) {
      diff.removed.ready.push(pattern);
    }
  }

  // Compare auth patterns
  for (const pattern of newMapping.authPatterns) {
    if (!oldMapping.authPatterns.includes(pattern)) {
      diff.added.auth.push(pattern);
    }
  }
  for (const pattern of oldMapping.authPatterns) {
    if (!newMapping.authPatterns.includes(pattern)) {
      diff.removed.auth.push(pattern);
    }
  }

  // Compare blocking patterns
  for (const pattern of newMapping.blockingPatterns) {
    if (!oldMapping.blockingPatterns.includes(pattern)) {
      diff.added.blocking.push(pattern);
    }
  }
  for (const pattern of oldMapping.blockingPatterns) {
    if (!newMapping.blockingPatterns.includes(pattern)) {
      diff.removed.blocking.push(pattern);
    }
  }

  // Determine if breaking (removed ready patterns could break detection)
  diff.isBreaking = diff.removed.ready.length > 0;

  // Generate summary
  const changes: string[] = [];
  if (diff.added.ready.length) changes.push(`+${diff.added.ready.length} ready patterns`);
  if (diff.removed.ready.length) changes.push(`-${diff.removed.ready.length} ready patterns`);
  if (diff.added.auth.length) changes.push(`+${diff.added.auth.length} auth patterns`);
  if (diff.removed.auth.length) changes.push(`-${diff.removed.auth.length} auth patterns`);
  if (diff.added.blocking.length) changes.push(`+${diff.added.blocking.length} blocking patterns`);
  if (diff.removed.blocking.length) changes.push(`-${diff.removed.blocking.length} blocking patterns`);

  diff.summary = changes.length > 0
    ? `${adapter} ${oldMapping.version} → ${newMapping.version}: ${changes.join(', ')}`
    : `${adapter} ${oldMapping.version} → ${newMapping.version}: No pattern changes`;

  return diff;
}

/**
 * Get patterns for a specific version, with fallback to latest
 */
export async function getPatternsForVersion(
  adapter: AdapterType,
  version: string,
  baseDir: string = '.'
): Promise<VersionPatternMapping | null> {
  const history = await loadVersionHistory(adapter, baseDir);

  // Exact version match
  if (history.versions[version]) {
    return history.versions[version];
  }

  // Find closest version (simple string comparison for now)
  // In production, use semver for proper version matching
  const versions = Object.keys(history.versions).sort().reverse();

  for (const v of versions) {
    if (v <= version) {
      return history.versions[v];
    }
  }

  // Fallback to latest
  if (history.latestVersion && history.versions[history.latestVersion]) {
    return history.versions[history.latestVersion];
  }

  return null;
}

/**
 * List all captured versions for an adapter
 */
export async function listCapturedVersions(
  adapter: AdapterType,
  baseDir: string = '.'
): Promise<string[]> {
  const history = await loadVersionHistory(adapter, baseDir);
  return Object.keys(history.versions).sort();
}
