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
  WatchedFile,
  WatchedFileConfig,
  FileChangeResult,
} from './types';

// Configuration
export {
  MONITORED_CLIS,
  BASELINE_READY_PATTERNS,
  BASELINE_AUTH_PATTERNS,
  BASELINE_LOADING_PATTERNS,
  BASELINE_TURN_COMPLETE_PATTERNS,
  BASELINE_TOOL_WAIT_PATTERNS,
  BASELINE_EXIT_PATTERNS,
} from './config';

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

// Watched files
export { WATCHED_FILES, getWatchedFiles, getWatchedFilesByCategory } from './watched-files';

// File change checking
export { checkFileChanges, checkAllFileChanges, listWatchedFiles } from './file-change-checker';
