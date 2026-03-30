import type { HttpClient } from '../http.js';
import type {
  BackupData,
  BackupInfoResponse,
  RestoreResponse,
  ValidateBackupResponse,
} from '../types/backup.js';

export class BackupResource {
  constructor(private http: HttpClient) {}

  /** Export database backup as JSON (Enterprise, admin only) */
  async export(): Promise<BackupData> {
    return this.http.get<BackupData>('/api/backup');
  }

  /** Get backup information without downloading (Enterprise, admin only) */
  async info(): Promise<BackupInfoResponse> {
    return this.http.get<BackupInfoResponse>('/api/backup/info');
  }

  /** Restore database from backup (Enterprise, admin only) */
  async restore(
    backup: BackupData,
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<RestoreResponse> {
    return this.http.request<RestoreResponse>({
      method: 'POST',
      path: '/api/backup/restore',
      body: backup,
      query: { mode },
    });
  }

  /** Validate a backup file without restoring (Enterprise, admin only) */
  async validate(backup: BackupData): Promise<ValidateBackupResponse> {
    return this.http.post<ValidateBackupResponse>(
      '/api/backup/validate',
      backup
    );
  }
}
