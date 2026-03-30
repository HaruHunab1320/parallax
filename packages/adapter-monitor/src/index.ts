/**
 * @parallaxai/adapter-monitor
 *
 * Automated CLI adapter monitoring - captures startup snapshots
 * and detects pattern changes across versions.
 */

// Configuration
export {
  BASELINE_AUTH_PATTERNS,
  BASELINE_EXIT_PATTERNS,
  BASELINE_LOADING_PATTERNS,
  BASELINE_READY_PATTERNS,
  BASELINE_TOOL_WAIT_PATTERNS,
  BASELINE_TURN_COMPLETE_PATTERNS,
  MONITORED_CLIS,
} from './config';
// File change checking
export {
  checkAllFileChanges,
  checkFileChanges,
  listWatchedFiles,
} from './file-change-checker';
// Snapshot capture
export {
  captureLocally,
  captureSnapshot,
  captureWithDocker,
} from './snapshot-capture';
// Snapshot storage
export {
  comparePatterns,
  extractPatterns,
  getPatternsForVersion,
  listCapturedVersions,
  loadLatestSnapshot,
  loadSnapshot,
  loadVersionHistory,
  saveSnapshot,
  saveVersionHistory,
  updateVersionHistory,
} from './snapshot-storage';
// Types
export type {
  AdapterType,
  AdapterVersionHistory,
  AnalysisResult,
  CaptureOptions,
  CLIVersionSource,
  DetectedPattern,
  FileChangeResult,
  PatternDiff,
  RegistryType,
  StartupSnapshot,
  VersionCheckResult,
  VersionPatternMapping,
  WatchedFile,
  WatchedFileConfig,
} from './types';
// Version checking
export {
  checkAllVersions,
  checkVersion,
  filterUpdatesAvailable,
} from './version-checker';
// Watched files
export {
  getWatchedFiles,
  getWatchedFilesByCategory,
  WATCHED_FILES,
} from './watched-files';
