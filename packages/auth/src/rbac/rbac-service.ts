import { Logger } from 'pino';
import { Permission, Role, JWTPayload } from '../types';
import { DefaultRoles, Resources, Actions, Scopes } from './permissions';

export interface RBACCheck {
  resource: string;
  action: string;
  resourceId?: string;
  tenantId?: string;
}

export class RBACService {
  private roles: Map<string, Role> = new Map();

  constructor(
    private logger: Logger,
    customRoles?: Role[]
  ) {
    // Load default roles
    Object.values(DefaultRoles).forEach(role => {
      this.roles.set(role.name, JSON.parse(JSON.stringify(role)) as Role);
    });

    // Add custom roles
    if (customRoles) {
      customRoles.forEach(role => {
        this.roles.set(role.name, role);
      });
    }
  }

  /**
   * Check if a user has permission to perform an action
   */
  async hasPermission(
    user: JWTPayload,
    check: RBACCheck
  ): Promise<boolean> {
    // Admin bypass
    if (user.roles.includes('admin')) {
      return true;
    }

    // Get all permissions for user's roles
    const permissions = this.getUserPermissions(user.roles);

    // Check each permission
    for (const permission of permissions) {
      if (this.matchesPermission(permission, check, user)) {
        this.logger.debug({
          userId: user.sub,
          permission,
          check,
        }, 'Permission granted');
        return true;
      }
    }

    this.logger.warn({
      userId: user.sub,
      roles: user.roles,
      check,
    }, 'Permission denied');

    return false;
  }

  /**
   * Get all permissions for a set of roles
   */
  getUserPermissions(roleNames: string[]): Permission[] {
    const permissions: Permission[] = [];
    
    for (const roleName of roleNames) {
      const role = this.roles.get(roleName);
      if (role) {
        permissions.push(...role.permissions);
      }
    }

    return permissions;
  }

  /**
   * Check if a permission matches the requested action
   */
  private matchesPermission(
    permission: Permission,
    check: RBACCheck,
    user: JWTPayload
  ): boolean {
    // Check resource match
    if (permission.resource !== check.resource) {
      return false;
    }

    // Check action match
    if (permission.action !== check.action && permission.action !== Actions.MANAGE) {
      return false;
    }

    // Check scope
    switch (permission.scope) {
      case Scopes.ALL:
        return true;

      case Scopes.TENANT:
        // User must be in the same tenant
        return !check.tenantId || user.tenantId === check.tenantId;

      case Scopes.OWN:
        // For user resources, check if it's the user's own resource
        if (check.resource === Resources.USER) {
          return check.resourceId === user.sub;
        }
        // For other resources, would need to check ownership
        // This would typically require a database lookup
        return true; // Simplified for now

      default:
        return true;
    }
  }

  /**
   * Add a custom role
   */
  addRole(role: Role): void {
    this.roles.set(role.name, role);
    this.logger.info({ role: role.name }, 'Role added');
  }

  /**
   * Get all available roles
   */
  getRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * Get a specific role
   */
  getRole(name: string): Role | undefined {
    return this.roles.get(name);
  }

  /**
   * Express middleware for checking permissions
   */
  requirePermission(check: Omit<RBACCheck, 'resourceId' | 'tenantId'>) {
    return async (req: any, res: any, next: any) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated',
        });
      }

      const fullCheck: RBACCheck = {
        ...check,
        resourceId: req.params.id || req.params.resourceId,
        tenantId: req.params.tenantId || req.query.tenantId || req.user.tenantId,
      };

      const hasPermission = await this.hasPermission(req.user, fullCheck);

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Insufficient permissions',
          required: {
            resource: check.resource,
            action: check.action,
          },
        });
      }

      next();
    };
  }
}