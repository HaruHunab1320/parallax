import type { HttpClient } from '../http.js';
import type {
  AuditCleanupResponse,
  AuditFailedLoginsResponse,
  AuditQueryParams,
  AuditQueryResponse,
  AuditResourceResponse,
  AuditStatsResponse,
  AuditUserResponse,
} from '../types/audit.js';

export class AuditResource {
  constructor(private http: HttpClient) {}

  /** Query audit logs with filters (Enterprise, admin only) */
  async query(params?: AuditQueryParams): Promise<AuditQueryResponse> {
    return this.http.get<AuditQueryResponse>(
      '/api/audit',
      params as Record<string, string | number | boolean | undefined>
    );
  }

  /** Get audit log statistics (Enterprise, admin only) */
  async stats(hours = 24): Promise<AuditStatsResponse> {
    return this.http.get<AuditStatsResponse>('/api/audit/stats', { hours });
  }

  /** Get audit logs for a specific user (Enterprise, admin only) */
  async userActivity(userId: string, limit = 50): Promise<AuditUserResponse> {
    return this.http.get<AuditUserResponse>(
      `/api/audit/user/${encodeURIComponent(userId)}`,
      { limit }
    );
  }

  /** Get audit logs for a specific resource (Enterprise, admin only) */
  async resourceHistory(
    resource: string,
    resourceId: string,
    limit = 50
  ): Promise<AuditResourceResponse> {
    return this.http.get<AuditResourceResponse>(
      `/api/audit/resource/${encodeURIComponent(resource)}/${encodeURIComponent(resourceId)}`,
      { limit }
    );
  }

  /** Get failed login attempts (Enterprise, admin only) */
  async failedLogins(
    email?: string,
    hours = 24
  ): Promise<AuditFailedLoginsResponse> {
    return this.http.get<AuditFailedLoginsResponse>(
      '/api/audit/failed-logins',
      {
        email,
        hours,
      }
    );
  }

  /** Clean up old audit logs (Enterprise, admin only) */
  async cleanup(retentionDays = 90): Promise<AuditCleanupResponse> {
    return this.http.post<AuditCleanupResponse>('/api/audit/cleanup', {
      retentionDays,
    });
  }
}
