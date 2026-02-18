/**
 * @parallax/adapter-monitor
 *
 * Automated CLI adapter monitoring - captures startup snapshots
 * and detects pattern changes across versions.
 */

// Types
export type {
  AdapterType,
  RegistryType,
  CLIVersionSource,
  DetectedPattern,
  StartupSnapshot,
  VersionPatternMapping,
  AdapterVersionHistory,
  PatternDiff,
  VersionCheckResult,
  CaptureOptions,
  AnalysisResult,
} from './types';

// Configuration
export { MONITORED_CLIS, BASELINE_READY_PATTERNS, BASELINE_AUTH_PATTERNS } from './config';

// Version checking
export { checkVersion, checkAllVersions, filterUpdatesAvailable } from './version-checker';

// Snapshot capture
export { captureSnapshot, captureWithDocker, captureLocally } from './snapshot-capture';

// Snapshot storage
export {
  saveSnapshot,
  loadSnapshot,
  loadLatestSnapshot,
  extractPatterns,
  loadVersionHistory,
  saveVersionHistory,
  updateVersionHistory,
  comparePatterns,
  getPatternsForVersion,
  listCapturedVersions,
} from './snapshot-storage';
