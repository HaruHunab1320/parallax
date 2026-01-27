/**
 * Audit Logging Middleware
 *
 * Express middleware for automatic audit logging of API actions.
 */

import { Request, Response, NextFunction } from 'express';
import { AuditService, AuditAction, AuditResource, AuditStatus } from './audit-service';

export interface AuditMiddlewareOptions {
  action: AuditAction;
  resource: AuditResource;
  getResourceId?: (req: Request) => string | undefined;
  getDetails?: (req: Request, res: Response) => Record<string, any> | undefined;
  skipIf?: (req: Request) => boolean;
}

/**
 * Create middleware that logs an audit event after the response
 */
export function createAuditMiddleware(
  auditService: AuditService,
  options: AuditMiddlewareOptions
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if we should skip auditing
    if (options.skipIf?.(req)) {
      next();
      return;
    }

    // Capture the original end function
    const originalEnd = res.end;
    const originalJson = res.json;

    let responseBody: any;

    // Override json to capture response body
    res.json = function (body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Override end to log after response
    res.end = function (this: Response, ...args: any[]) {
      // Determine status based on response code
      const status: AuditStatus = res.statusCode >= 400 ? 'failure' : 'success';

      // Get resource ID
      const resourceId = options.getResourceId?.(req) || req.params.id || req.params.name;

      // Get additional details
      let details = options.getDetails?.(req, res);

      // Add error info for failures
      if (status === 'failure' && responseBody?.error) {
        details = {
          ...details,
          error: responseBody.error,
          code: responseBody.code,
        };
      }

      // Log asynchronously (don't block response)
      setImmediate(() => {
        auditService.logFromRequest(
          req,
          options.action,
          options.resource,
          resourceId,
          status,
          details
        ).catch(() => {
          // Silently ignore audit logging errors
        });
      });

      return originalEnd.apply(this, args as any);
    };

    next();
  };
}

/**
 * Audit middleware for pattern operations
 */
export function auditPattern(auditService: AuditService, action: AuditAction) {
  return createAuditMiddleware(auditService, {
    action,
    resource: 'pattern',
    getResourceId: (req) => req.params.name || req.body?.name,
    getDetails: (req) => {
      if (action === 'create' || action === 'update') {
        return { patternName: req.body?.name };
      }
      return undefined;
    },
  });
}

/**
 * Audit middleware for execution operations
 */
export function auditExecution(auditService: AuditService, action: AuditAction) {
  return createAuditMiddleware(auditService, {
    action,
    resource: 'execution',
    getResourceId: (req) => req.params.id,
    getDetails: (req) => {
      if (action === 'execute') {
        return {
          patternName: req.params.name,
          inputKeys: req.body ? Object.keys(req.body) : [],
        };
      }
      return undefined;
    },
  });
}

/**
 * Audit middleware for user operations
 */
export function auditUser(auditService: AuditService, action: AuditAction) {
  return createAuditMiddleware(auditService, {
    action,
    resource: 'user',
    getResourceId: (req) => req.params.id,
    getDetails: (req) => {
      if (action === 'create') {
        return { email: req.body?.email, role: req.body?.role };
      }
      if (action === 'update') {
        // Don't log password changes in details
        const { password, ...safeBody } = req.body || {};
        return { updates: Object.keys(safeBody) };
      }
      return undefined;
    },
  });
}

/**
 * Audit middleware for schedule operations
 */
export function auditSchedule(auditService: AuditService, action: AuditAction) {
  return createAuditMiddleware(auditService, {
    action,
    resource: 'schedule',
    getResourceId: (req) => req.params.id,
    getDetails: (req) => {
      if (action === 'create' || action === 'update') {
        return {
          name: req.body?.name,
          patternName: req.body?.patternName,
          cronExpression: req.body?.cronExpression,
        };
      }
      return undefined;
    },
  });
}

/**
 * Audit middleware for trigger operations
 */
export function auditTrigger(auditService: AuditService, action: AuditAction) {
  return createAuditMiddleware(auditService, {
    action,
    resource: 'trigger',
    getResourceId: (req) => req.params.id,
    getDetails: (req) => {
      if (action === 'create' || action === 'update') {
        return {
          name: req.body?.name,
          type: req.body?.type,
          patternName: req.body?.patternName,
        };
      }
      return undefined;
    },
  });
}

/**
 * Audit middleware for API key operations
 */
export function auditApiKey(auditService: AuditService, action: AuditAction) {
  return createAuditMiddleware(auditService, {
    action: action === 'create' ? 'api_key_create' : 'api_key_revoke',
    resource: 'api_key',
    getResourceId: (req) => req.params.keyId,
    getDetails: (req) => ({
      userId: req.params.id,
      keyName: req.body?.name,
    }),
  });
}

/**
 * Audit middleware for backup operations
 */
export function auditBackup(auditService: AuditService, action: 'create' | 'read') {
  return createAuditMiddleware(auditService, {
    action,
    resource: 'backup',
    getDetails: (req) => ({
      format: req.query?.format || req.body?.format,
    }),
  });
}
