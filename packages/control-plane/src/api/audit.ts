/**
 * Audit Log API Router
 *
 * REST API endpoints for querying audit logs.
 */

import { Router } from 'express';
import { Logger } from 'pino';
import { AuditService } from '../audit/audit-service';
import { LicenseEnforcer } from '../licensing/license-enforcer';
import { AuthService } from '../auth/auth-service';
import { createAuthMiddleware } from '../auth/auth-middleware';
import { createRBACMiddleware, RESOURCES, ACTIONS } from '../auth/rbac';

export function createAuditRouter(
  auditService: AuditService,
  authService: AuthService,
  licenseEnforcer: LicenseEnforcer,
  logger: Logger
): Router {
  const router = Router();
  const log = logger.child({ component: 'AuditAPI' });

  // Middleware to check enterprise license
  const requireAuditLogging = (_req: any, res: any, next: any) => {
    try {
      licenseEnforcer.requireFeature('audit_logging', 'Audit Logging');
      next();
    } catch (error: any) {
      log.warn('Audit logging feature not available');
      res.status(403).json({
        error: error.message,
        code: 'FEATURE_NOT_AVAILABLE',
        upgradeUrl: error.upgradeUrl || 'https://parallax.ai/enterprise',
      });
    }
  };

  // Apply license check and auth to all routes
  router.use(requireAuditLogging);
  router.use(createAuthMiddleware(authService, logger));

  // Only admins can view audit logs
  const requireAuditAccess = createRBACMiddleware(logger, {
    resource: RESOURCES.SETTINGS,
    action: ACTIONS.MANAGE,
  });

  /**
   * GET /audit
   * Query audit logs with filters
   */
  router.get('/', requireAuditAccess, async (req: any, res: any) => {
    try {
      const {
        userId,
        action,
        resource,
        resourceId,
        status,
        startDate,
        endDate,
        limit,
        offset,
      } = req.query;

      const result = await auditService.query({
        userId,
        action,
        resource,
        resourceId,
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
      });

      res.json({
        logs: result.logs,
        total: result.total,
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
      });
    } catch (error) {
      log.error({ error }, 'Failed to query audit logs');
      res.status(500).json({
        error: 'Failed to query audit logs',
        code: 'AUDIT_QUERY_ERROR',
      });
    }
  });

  /**
   * GET /audit/stats
   * Get audit log statistics
   */
  router.get('/stats', requireAuditAccess, async (req: any, res: any) => {
    try {
      const hours = req.query.hours ? parseInt(req.query.hours, 10) : 24;
      const stats = await auditService.getStats(hours);

      res.json({
        period: `${hours} hours`,
        ...stats,
      });
    } catch (error) {
      log.error({ error }, 'Failed to get audit stats');
      res.status(500).json({
        error: 'Failed to get audit statistics',
        code: 'AUDIT_STATS_ERROR',
      });
    }
  });

  /**
   * GET /audit/user/:userId
   * Get audit logs for a specific user
   */
  router.get('/user/:userId', requireAuditAccess, async (req: any, res: any) => {
    try {
      const { userId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

      const logs = await auditService.getUserActivity(userId, limit);

      res.json({ logs, userId });
    } catch (error) {
      log.error({ error, userId: req.params.userId }, 'Failed to get user audit logs');
      res.status(500).json({
        error: 'Failed to get user audit logs',
        code: 'AUDIT_USER_ERROR',
      });
    }
  });

  /**
   * GET /audit/resource/:resource/:resourceId
   * Get audit logs for a specific resource
   */
  router.get('/resource/:resource/:resourceId', requireAuditAccess, async (req: any, res: any) => {
    try {
      const { resource, resourceId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

      const logs = await auditService.getResourceHistory(resource, resourceId, limit);

      res.json({ logs, resource, resourceId });
    } catch (error) {
      log.error(
        { error, resource: req.params.resource, resourceId: req.params.resourceId },
        'Failed to get resource audit logs'
      );
      res.status(500).json({
        error: 'Failed to get resource audit logs',
        code: 'AUDIT_RESOURCE_ERROR',
      });
    }
  });

  /**
   * GET /audit/failed-logins
   * Get recent failed login attempts
   */
  router.get('/failed-logins', requireAuditAccess, async (req: any, res: any) => {
    try {
      const email = req.query.email;
      const hours = req.query.hours ? parseInt(req.query.hours, 10) : 24;

      const result = await auditService.getFailedLogins(email, hours);

      res.json({
        ...result,
        period: `${hours} hours`,
        email: email || 'all',
      });
    } catch (error) {
      log.error({ error }, 'Failed to get failed logins');
      res.status(500).json({
        error: 'Failed to get failed login attempts',
        code: 'AUDIT_LOGINS_ERROR',
      });
    }
  });

  /**
   * POST /audit/cleanup
   * Clean up old audit logs (admin only)
   */
  router.post('/cleanup', requireAuditAccess, async (req: any, res: any) => {
    try {
      const retentionDays = req.body.retentionDays || 90;

      if (retentionDays < 30) {
        res.status(400).json({
          error: 'Retention period must be at least 30 days',
          code: 'INVALID_RETENTION',
        });
        return;
      }

      const deletedCount = await auditService.cleanup(retentionDays);

      // Log the cleanup action itself
      await auditService.logFromRequest(req, 'delete', 'settings', 'audit_logs', 'success', {
        retentionDays,
        deletedCount,
      });

      res.json({
        message: 'Audit log cleanup completed',
        deletedCount,
        retentionDays,
      });
    } catch (error) {
      log.error({ error }, 'Failed to cleanup audit logs');
      res.status(500).json({
        error: 'Failed to cleanup audit logs',
        code: 'AUDIT_CLEANUP_ERROR',
      });
    }
  });

  return router;
}
