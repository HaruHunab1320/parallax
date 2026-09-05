import type { Request, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { createAuthMiddleware } from './auth-middleware';
import type { AuthService } from './auth-service';
import { type Action, createRBACMiddleware, type Resource } from './rbac';

function requestPath(req: Request): string {
  // Express routes are case-insensitive by default and decode route parameters.
  try {
    return (
      decodeURIComponent(req.path).replace(/\/+$/, '').toLowerCase() || '/'
    );
  } catch {
    return '/invalid-path';
  }
}

export function isPublicApiRequest(req: Request): boolean {
  const path = requestPath(req);
  if (path === '/auth' || path.startsWith('/auth/')) return true; // Each auth operation enforces its own boundary.
  if (
    ['GET', 'HEAD'].includes(req.method) &&
    /^\/license(?:\/features|\/check\/[^/]+)?$/.test(path)
  )
    return true;
  // Signature verification is mandatory inside this receiver.
  return req.method === 'POST' && path === '/webhooks/github';
}

function permissionForRequest(
  req: Request
): { resource: Resource; action: Action } | undefined {
  const path = requestPath(req);
  const segments = path.split('/').filter(Boolean);
  const read = req.method === 'GET' || req.method === 'HEAD';
  const action: Action = read
    ? 'read'
    : req.method === 'DELETE'
      ? 'delete'
      : ['PUT', 'PATCH'].includes(req.method)
        ? 'update'
        : 'create';
  switch (segments[0]) {
    case 'patterns':
      return {
        resource: 'patterns',
        action: !read && segments.at(-1) === 'execute' ? 'execute' : action,
      };
    case 'agents':
    case 'managed-agents':
    case 'managed-threads':
      return {
        resource: 'agents',
        action:
          !read &&
          ['send', 'test', 'shared-decisions'].includes(segments.at(-1) || '')
            ? 'update'
            : action,
      };
    case 'executions':
      return {
        resource: 'executions',
        action: !read && segments.at(-1) === 'cancel' ? 'manage' : action,
      };
    case 'schedules':
      return {
        resource: 'schedules',
        action: !read && segments.length > 2 ? 'update' : action,
      };
    case 'triggers':
      return {
        resource: 'triggers',
        action: !read && segments.length > 2 ? 'update' : action,
      };
    case 'license':
      return { resource: 'license', action: read ? 'read' : 'manage' };
    // Workspace paths and credentials can expose host code or mint credentials.
    // Until project ownership exists, these are administrator operations.
    case 'workspaces':
    case 'credentials':
    case 'audit':
    case 'backup':
      return { resource: 'settings', action: 'manage' };
    default:
      return undefined;
  }
}

/** Central default-deny authorization; user routes apply self/admin rules internally. */
export function createApiAuthorization(logger: Logger): RequestHandler {
  return (req, res, next) => {
    if (isPublicApiRequest(req)) return next();
    if (/^\/users(?:\/|$)/.test(requestPath(req))) return next();
    const permission = permissionForRequest(req);
    if (!permission) {
      res.status(403).json({
        error: 'No access policy for this endpoint',
        code: 'FORBIDDEN',
      });
      return;
    }
    createRBACMiddleware(logger, permission)(req, res, next);
  };
}

export function createApiAuthentication(
  authService: AuthService,
  logger: Logger
): RequestHandler {
  const required = createAuthMiddleware(authService, logger);
  const optional = createAuthMiddleware(authService, logger, {
    optional: true,
  });
  return (req, res, next) => {
    if (isPublicApiRequest(req)) return next();
    // Legacy dashboard setup detection returns count only and never user records.
    if (['GET', 'HEAD'].includes(req.method) && requestPath(req) === '/users') {
      void optional(req, res, next);
      return;
    }
    void required(req, res, next);
  };
}
