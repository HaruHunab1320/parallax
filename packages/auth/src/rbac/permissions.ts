/**
 * Define all permissions in the system
 */

export const Resources = {
  AGENT: 'agent',
  PATTERN: 'pattern',
  EXECUTION: 'execution',
  USER: 'user',
  TENANT: 'tenant',
  METRICS: 'metrics',
  SYSTEM: 'system',
} as const;

export const Actions = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXECUTE: 'execute',
  MANAGE: 'manage',
} as const;

export const Scopes = {
  OWN: 'own',      // Only own resources
  TENANT: 'tenant', // All resources in tenant
  ALL: 'all',      // All resources (admin)
} as const;

/**
 * Pre-defined permissions
 */
export const Permissions = {
  // Agent permissions
  AGENT_CREATE: { resource: Resources.AGENT, action: Actions.CREATE },
  AGENT_READ: { resource: Resources.AGENT, action: Actions.READ },
  AGENT_UPDATE: { resource: Resources.AGENT, action: Actions.UPDATE },
  AGENT_DELETE: { resource: Resources.AGENT, action: Actions.DELETE },
  AGENT_MANAGE: { resource: Resources.AGENT, action: Actions.MANAGE },

  // Pattern permissions
  PATTERN_READ: { resource: Resources.PATTERN, action: Actions.READ },
  PATTERN_EXECUTE: { resource: Resources.PATTERN, action: Actions.EXECUTE },
  PATTERN_MANAGE: { resource: Resources.PATTERN, action: Actions.MANAGE },

  // Execution permissions
  EXECUTION_READ: { resource: Resources.EXECUTION, action: Actions.READ },
  EXECUTION_CREATE: { resource: Resources.EXECUTION, action: Actions.CREATE },

  // User permissions
  USER_READ: { resource: Resources.USER, action: Actions.READ },
  USER_UPDATE: { resource: Resources.USER, action: Actions.UPDATE },
  USER_DELETE: { resource: Resources.USER, action: Actions.DELETE },
  USER_MANAGE: { resource: Resources.USER, action: Actions.MANAGE },

  // Tenant permissions
  TENANT_READ: { resource: Resources.TENANT, action: Actions.READ },
  TENANT_UPDATE: { resource: Resources.TENANT, action: Actions.UPDATE },
  TENANT_MANAGE: { resource: Resources.TENANT, action: Actions.MANAGE },

  // Metrics permissions
  METRICS_READ: { resource: Resources.METRICS, action: Actions.READ },

  // System permissions
  SYSTEM_MANAGE: { resource: Resources.SYSTEM, action: Actions.MANAGE },
} as const;

/**
 * Pre-defined roles
 */
export const DefaultRoles = {
  ADMIN: {
    name: 'admin',
    description: 'Full system administrator',
    permissions: [
      { ...Permissions.AGENT_MANAGE, scope: Scopes.ALL },
      { ...Permissions.PATTERN_MANAGE, scope: Scopes.ALL },
      { ...Permissions.USER_MANAGE, scope: Scopes.ALL },
      { ...Permissions.TENANT_MANAGE, scope: Scopes.ALL },
      { ...Permissions.SYSTEM_MANAGE, scope: Scopes.ALL },
      { ...Permissions.METRICS_READ, scope: Scopes.ALL },
    ],
  },
  TENANT_ADMIN: {
    name: 'tenant_admin',
    description: 'Tenant administrator',
    permissions: [
      { ...Permissions.AGENT_MANAGE, scope: Scopes.TENANT },
      { ...Permissions.PATTERN_EXECUTE, scope: Scopes.TENANT },
      { ...Permissions.USER_MANAGE, scope: Scopes.TENANT },
      { ...Permissions.TENANT_UPDATE, scope: Scopes.OWN },
      { ...Permissions.METRICS_READ, scope: Scopes.TENANT },
    ],
  },
  OPERATOR: {
    name: 'operator',
    description: 'System operator',
    permissions: [
      { ...Permissions.AGENT_READ, scope: Scopes.TENANT },
      { ...Permissions.AGENT_UPDATE, scope: Scopes.TENANT },
      { ...Permissions.PATTERN_EXECUTE, scope: Scopes.TENANT },
      { ...Permissions.EXECUTION_READ, scope: Scopes.TENANT },
      { ...Permissions.METRICS_READ, scope: Scopes.TENANT },
    ],
  },
  DEVELOPER: {
    name: 'developer',
    description: 'Developer with pattern execution rights',
    permissions: [
      { ...Permissions.AGENT_READ, scope: Scopes.TENANT },
      { ...Permissions.PATTERN_READ, scope: Scopes.TENANT },
      { ...Permissions.PATTERN_EXECUTE, scope: Scopes.TENANT },
      { ...Permissions.EXECUTION_READ, scope: Scopes.OWN },
      { ...Permissions.EXECUTION_CREATE, scope: Scopes.OWN },
    ],
  },
  VIEWER: {
    name: 'viewer',
    description: 'Read-only access',
    permissions: [
      { ...Permissions.AGENT_READ, scope: Scopes.TENANT },
      { ...Permissions.PATTERN_READ, scope: Scopes.TENANT },
      { ...Permissions.EXECUTION_READ, scope: Scopes.TENANT },
      { ...Permissions.METRICS_READ, scope: Scopes.TENANT },
    ],
  },
  USER: {
    name: 'user',
    description: 'Basic user',
    permissions: [
      { ...Permissions.USER_READ, scope: Scopes.OWN },
      { ...Permissions.USER_UPDATE, scope: Scopes.OWN },
    ],
  },
} as const;