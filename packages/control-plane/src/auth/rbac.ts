/**
 * Role-Based Access Control (RBAC)
 *
 * Defines roles, permissions, and middleware for authorization.
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';

// Available roles in the system (hierarchical from most to least privileged)
export const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  DEVELOPER: 'developer',
  VIEWER: 'viewer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// Resource types that can be protected
export const RESOURCES = {
  PATTERNS: 'patterns',
  AGENTS: 'agents',
  EXECUTIONS: 'executions',
  SCHEDULES: 'schedules',
  TRIGGERS: 'triggers',
  USERS: 'users',
  API_KEYS: 'api_keys',
  LICENSE: 'license',
  SETTINGS: 'settings',
} as const;

export type Resource = (typeof RESOURCES)[keyof typeof RESOURCES];

// Actions that can be performed on resources
export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXECUTE: 'execute',
  MANAGE: 'manage', // Full control including admin operations
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

/**
 * Permission matrix defining what each role can do
 *
 * admin: Full access to everything
 * operator: Can execute patterns, manage schedules/triggers, view users
 * developer: Can manage patterns, view executions and agents
 * viewer: Read-only access to patterns, agents, and executions
 */
const PERMISSION_MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  admin: {
    patterns: ['create', 'read', 'update', 'delete', 'execute', 'manage'],
    agents: ['create', 'read', 'update', 'delete', 'manage'],
    executions: ['create', 'read', 'delete', 'manage'],
    schedules: ['create', 'read', 'update', 'delete', 'manage'],
    triggers: ['create', 'read', 'update', 'delete', 'manage'],
    users: ['create', 'read', 'update', 'delete', 'manage'],
    api_keys: ['create', 'read', 'delete', 'manage'],
    license: ['read', 'update', 'manage'],
    settings: ['read', 'update', 'manage'],
  },
  operator: {
    patterns: ['read', 'execute'],
    agents: ['read', 'update'],
    executions: ['create', 'read'],
    schedules: ['create', 'read', 'update', 'delete'],
    triggers: ['create', 'read', 'update', 'delete'],
    users: ['read'],
    api_keys: ['read'],
    license: ['read'],
    settings: ['read'],
  },
  developer: {
    patterns: ['create', 'read', 'update', 'delete', 'execute'],
    agents: ['read'],
    executions: ['create', 'read'],
    schedules: ['read'],
    triggers: ['read'],
    users: [],
    api_keys: [],
    license: ['read'],
    settings: ['read'],
  },
  viewer: {
    patterns: ['read'],
    agents: ['read'],
    executions: ['read'],
    schedules: ['read'],
    triggers: ['read'],
    users: [],
    api_keys: [],
    license: ['read'],
    settings: ['read'],
  },
};

/**
 * Check if a role has permission to perform an action on a resource
 */
export function hasPermission(role: Role, resource: Resource, action: Action): boolean {
  const rolePermissions = PERMISSION_MATRIX[role];
  if (!rolePermissions) return false;

  const resourcePermissions = rolePermissions[resource];
  if (!resourcePermissions) return false;

  return resourcePermissions.includes(action);
}

/**
 * Check if a role has at least one of the specified permissions
 */
export function hasAnyPermission(
  role: Role,
  permissions: Array<{ resource: Resource; action: Action }>
): boolean {
  return permissions.some(({ resource, action }) => hasPermission(role, resource, action));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(
  role: Role,
  permissions: Array<{ resource: Resource; action: Action }>
): boolean {
  return permissions.every(({ resource, action }) => hasPermission(role, resource, action));
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): Array<{ resource: Resource; action: Action }> {
  const rolePermissions = PERMISSION_MATRIX[role];
  if (!rolePermissions) return [];

  const permissions: Array<{ resource: Resource; action: Action }> = [];

  for (const [resource, actions] of Object.entries(rolePermissions)) {
    for (const action of actions || []) {
      permissions.push({ resource: resource as Resource, action: action as Action });
    }
  }

  return permissions;
}

/**
 * Check if API key has permission (based on key's permission restrictions)
 */
export function checkApiKeyPermission(
  apiKeyPermissions: any,
  resource: Resource,
  action: Action
): boolean {
  // If no restrictions, inherit from user's role
  if (!apiKeyPermissions) return true;

  // If permissions is an array of strings like ["patterns:read", "executions:*"]
  if (Array.isArray(apiKeyPermissions)) {
    const exactMatch = `${resource}:${action}`;
    const wildcardMatch = `${resource}:*`;
    const globalWildcard = '*:*';

    return apiKeyPermissions.some(
      (p: string) => p === exactMatch || p === wildcardMatch || p === globalWildcard
    );
  }

  // If permissions is an object like { patterns: ["read"], executions: ["read", "create"] }
  if (typeof apiKeyPermissions === 'object') {
    const resourcePerms = apiKeyPermissions[resource];
    if (!resourcePerms) return false;
    if (resourcePerms === '*') return true;
    if (Array.isArray(resourcePerms)) {
      return resourcePerms.includes(action) || resourcePerms.includes('*');
    }
  }

  return false;
}

export interface RBACMiddlewareOptions {
  resource: Resource;
  action: Action;
  allowApiKey?: boolean; // Whether to allow API key auth (default: true)
}

/**
 * Create RBAC middleware that checks permissions
 */
export function createRBACMiddleware(logger: Logger, options: RBACMiddlewareOptions) {
  const log = logger.child({ component: 'RBAC' });

  return (req: Request, res: Response, next: NextFunction): void => {
    const { resource, action, allowApiKey = true } = options;

    // Check if user is authenticated
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'NO_AUTH',
      });
      return;
    }

    const userRole = req.user.role as Role;

    // Check user's role-based permission
    const roleHasPermission = hasPermission(userRole, resource, action);

    // If using API key, also check API key restrictions
    if (req.apiKey && !allowApiKey) {
      res.status(403).json({
        error: 'This endpoint does not allow API key authentication',
        code: 'API_KEY_NOT_ALLOWED',
      });
      return;
    }

    if (req.apiKey?.permissions) {
      const apiKeyHasPermission = checkApiKeyPermission(req.apiKey.permissions, resource, action);
      if (!apiKeyHasPermission) {
        log.warn(
          { userId: req.user.sub, resource, action, apiKeyId: req.apiKey.id },
          'API key lacks permission'
        );
        res.status(403).json({
          error: `API key does not have permission to ${action} ${resource}`,
          code: 'FORBIDDEN',
        });
        return;
      }
    }

    // Check role permission
    if (!roleHasPermission) {
      log.warn(
        { userId: req.user.sub, role: userRole, resource, action },
        'Permission denied'
      );
      res.status(403).json({
        error: `Role '${userRole}' does not have permission to ${action} ${resource}`,
        code: 'FORBIDDEN',
      });
      return;
    }

    log.debug(
      { userId: req.user.sub, role: userRole, resource, action },
      'Permission granted'
    );

    next();
  };
}

/**
 * Middleware to require specific role(s)
 */
export function requireRole(logger: Logger, ...allowedRoles: Role[]) {
  const log = logger.child({ component: 'RBAC' });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'NO_AUTH',
      });
      return;
    }

    const userRole = req.user.role as Role;

    if (!allowedRoles.includes(userRole)) {
      log.warn(
        { userId: req.user.sub, role: userRole, requiredRoles: allowedRoles },
        'Role not allowed'
      );
      res.status(403).json({
        error: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        code: 'FORBIDDEN',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require admin role
 */
export function requireAdmin(logger: Logger) {
  return requireRole(logger, ROLES.ADMIN);
}

/**
 * Check if user can access a specific user's data (self or admin)
 */
export function canAccessUser(
  requestingUserId: string,
  requestingUserRole: Role,
  targetUserId: string
): boolean {
  // Users can always access their own data
  if (requestingUserId === targetUserId) return true;

  // Admins can access any user's data
  if (requestingUserRole === ROLES.ADMIN) return true;

  return false;
}
