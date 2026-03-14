export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  status: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string;
}

export interface AuditQueryParams {
  userId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditQueryResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditStatsResponse {
  period: string;
  [key: string]: unknown;
}

export interface AuditUserResponse {
  logs: AuditLog[];
  userId: string;
}

export interface AuditResourceResponse {
  logs: AuditLog[];
  resource: string;
  resourceId: string;
}

export interface AuditFailedLoginsResponse {
  period: string;
  email: string;
  [key: string]: unknown;
}

export interface AuditCleanupResponse {
  message: string;
  deletedCount: number;
  retentionDays: number;
}
