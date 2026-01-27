/**
 * Authentication Module
 *
 * Exports all authentication-related functionality.
 */

export { AuthService, AuthError, AuthConfig, TokenPayload, AuthTokens } from './auth-service';
export {
  createAuthMiddleware,
  requireAuth,
  optionalAuth,
  AuthMiddlewareOptions,
} from './auth-middleware';
export {
  // Constants
  ROLES,
  RESOURCES,
  ACTIONS,
  // Types
  Role,
  Resource,
  Action,
  RBACMiddlewareOptions,
  // Functions
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getRolePermissions,
  checkApiKeyPermission,
  canAccessUser,
  // Middleware
  createRBACMiddleware,
  requireRole,
  requireAdmin,
} from './rbac';
