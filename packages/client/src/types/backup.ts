export interface BackupData {
  version: string;
  timestamp: string;
  tables: {
    patterns: unknown[];
    agents: unknown[];
    users: unknown[];
    schedules: unknown[];
    triggers: unknown[];
    licenses: unknown[];
  };
  metadata: {
    totalRecords: number;
    exportedBy?: string;
  };
}

export interface BackupInfoResponse {
  tables: Record<string, number>;
  totalRecords: number;
  executionsExcluded: boolean;
  executionCount: number;
  note: string;
}

export interface RestoreResponse {
  message: string;
  mode: string;
  backupTimestamp: string;
  results: Record<
    string,
    { created: number; updated: number; skipped: number }
  >;
}

export interface ValidateBackupResponse {
  valid: boolean;
  issues: string[];
  backup?: {
    version: string;
    timestamp: string;
    records: number;
    tables: Record<string, number>;
  };
}
