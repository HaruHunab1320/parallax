/**
 * Audit Logging Service
 *
 * Tracks all user actions for compliance and security monitoring.
 */

import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';
import { Request } from 'express';

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'execute'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_change'
  | 'password_reset'
  | 'api_key_create'
  | 'api_key_revoke';

export type AuditResource =
  | 'pattern'
  | 'agent'
  | 'execution'
  | 'schedule'
  | 'trigger'
  | 'user'
  | 'api_key'
  | 'license'
  | 'settings'
  | 'backup'
  | 'auth';

export type AuditStatus = 'success' | 'failure';

export interface AuditEntry {
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  status?: AuditStatus;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditQueryOptions {
  userId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  resourceId?: string;
  status?: AuditStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditService {
  private logger: Logger;

  constructor(
    private prisma: PrismaClient,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'AuditService' });
  }

  /**
   * Log an audit event
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          userEmail: entry.userEmail,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          status: entry.status || 'success',
          details: entry.details || {},
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });

      this.logger.debug(
        {
          userId: entry.userId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
        },
        'Audit event logged'
      );
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      this.logger.error({ error, entry }, 'Failed to log audit event');
    }
  }

  /**
   * Log an audit event from an Express request
   */
  async logFromRequest(
    req: Request,
    action: AuditAction,
    resource: AuditResource,
    resourceId?: string,
    status: AuditStatus = 'success',
    details?: Record<string, any>
  ): Promise<void> {
    const entry: AuditEntry = {
      userId: req.user?.sub,
      userEmail: req.user?.email,
      action,
      resource,
      resourceId,
      status,
      details,
      ipAddress: this.getClientIp(req),
      userAgent: req.headers['user-agent'],
    };

    await this.log(entry);
  }

  /**
   * Query audit logs
   */
  async query(options: AuditQueryOptions = {}): Promise<{
    logs: any[];
    total: number;
  }> {
    const where: any = {};

    if (options.userId) where.userId = options.userId;
    if (options.action) where.action = options.action;
    if (options.resource) where.resource = options.resource;
    if (options.resourceId) where.resourceId = options.resourceId;
    if (options.status) where.status = options.status;

    if (options.startDate || options.endDate) {
      where.timestamp = {};
      if (options.startDate) where.timestamp.gte = options.startDate;
      if (options.endDate) where.timestamp.lte = options.endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        take: options.limit || 100,
        skip: options.offset || 0,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Get audit logs for a specific resource
   */
  async getResourceHistory(
    resource: AuditResource,
    resourceId: string,
    limit = 50
  ): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      where: { resource, resourceId },
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserActivity(userId: string, limit = 50): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      where: { userId },
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get recent failed login attempts
   */
  async getFailedLogins(
    email?: string,
    hours = 24
  ): Promise<{ count: number; logs: any[] }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const where: any = {
      action: 'login_failed',
      timestamp: { gte: since },
    };

    if (email) where.userEmail = email;

    const [logs, count] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        take: 100,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { count, logs };
  }

  /**
   * Get summary statistics for audit logs
   */
  async getStats(hours = 24): Promise<{
    totalEvents: number;
    byAction: Record<string, number>;
    byResource: Record<string, number>;
    failedLogins: number;
    uniqueUsers: number;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [total, byAction, byResource, failedLogins, uniqueUsers] = await Promise.all([
      this.prisma.auditLog.count({
        where: { timestamp: { gte: since } },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: { timestamp: { gte: since } },
        _count: true,
      }),
      this.prisma.auditLog.groupBy({
        by: ['resource'],
        where: { timestamp: { gte: since } },
        _count: true,
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'login_failed',
          timestamp: { gte: since },
        },
      }),
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          timestamp: { gte: since },
          userId: { not: null },
        },
      }),
    ]);

    return {
      totalEvents: total,
      byAction: Object.fromEntries(byAction.map((r) => [r.action, r._count])),
      byResource: Object.fromEntries(byResource.map((r) => [r.resource, r._count])),
      failedLogins,
      uniqueUsers: uniqueUsers.length,
    };
  }

  /**
   * Cleanup old audit logs (retention policy)
   */
  async cleanup(retentionDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.prisma.auditLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });

    this.logger.info(
      { deletedCount: result.count, retentionDays },
      'Audit log cleanup completed'
    );

    return result.count;
  }

  /**
   * Extract client IP from request (handles proxies)
   */
  private getClientIp(req: Request): string | undefined {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }
    return req.ip || req.socket?.remoteAddress;
  }
}
