/**
 * Authentication Module
 *
 * Exports all authentication-related functionality.
 */

export {
  AuthMiddlewareOptions,
  createAuthMiddleware,
  optionalAuth,
  requireAuth,
} from './auth-middleware';
export {
  AuthConfig,
  AuthError,
  AuthService,
  AuthTokens,
  TokenPayload,
} from './auth-service';
export {
  ACTIONS,
  Action,
  canAccessUser,
  checkApiKeyPermission,
  // Middleware
  createRBACMiddleware,
  getRolePermissions,
  hasAllPermissions,
  hasAnyPermission,
  // Functions
  hasPermission,
  RBACMiddlewareOptions,
  RESOURCES,
  Resource,
  // Constants
  ROLES,
  // Types
  Role,
  requireAdmin,
  requireRole,
} from './rbac';
