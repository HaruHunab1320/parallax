import { describe, it, expect, beforeEach } from 'vitest';
import { RBACService } from './rbac-service';
import { Resources, Actions, DefaultRoles, Permissions, Scopes } from './permissions';
import { JWTPayload } from '../types';
import pino from 'pino';

const logger = pino({ level: 'silent' });

const adminUser: JWTPayload = {
  sub: 'user-admin',
  email: 'admin@parallax.dev',
  name: 'Admin',
  roles: ['admin'],
  tenantId: 'tenant-1',
};

const developerUser: JWTPayload = {
  sub: 'user-dev',
  email: 'dev@parallax.dev',
  name: 'Developer',
  roles: ['developer'],
  tenantId: 'tenant-1',
};

const viewerUser: JWTPayload = {
  sub: 'user-viewer',
  email: 'viewer@parallax.dev',
  name: 'Viewer',
  roles: ['viewer'],
  tenantId: 'tenant-1',
};

describe('RBACService', () => {
  let rbac: RBACService;

  beforeEach(() => {
    rbac = new RBACService(logger);
  });

  describe('hasPermission', () => {
    it('should grant admin all permissions', async () => {
      const result = await rbac.hasPermission(adminUser, {
        resource: Resources.SYSTEM,
        action: Actions.MANAGE,
      });
      expect(result).toBe(true);
    });

    it('should grant developer pattern execution', async () => {
      const result = await rbac.hasPermission(developerUser, {
        resource: Resources.PATTERN,
        action: Actions.EXECUTE,
        tenantId: 'tenant-1',
      });
      expect(result).toBe(true);
    });

    it('should deny viewer pattern execution', async () => {
      const result = await rbac.hasPermission(viewerUser, {
        resource: Resources.PATTERN,
        action: Actions.EXECUTE,
      });
      expect(result).toBe(false);
    });

    it('should grant viewer read access to agents', async () => {
      const result = await rbac.hasPermission(viewerUser, {
        resource: Resources.AGENT,
        action: Actions.READ,
        tenantId: 'tenant-1',
      });
      expect(result).toBe(true);
    });

    it('should deny developer user deletion', async () => {
      const result = await rbac.hasPermission(developerUser, {
        resource: Resources.USER,
        action: Actions.DELETE,
      });
      expect(result).toBe(false);
    });

    it('should scope tenant access correctly', async () => {
      // Developer in tenant-1 accessing tenant-2 resources
      const result = await rbac.hasPermission(developerUser, {
        resource: Resources.AGENT,
        action: Actions.READ,
        tenantId: 'tenant-2', // Different tenant
      });
      expect(result).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return permissions for a role', () => {
      const perms = rbac.getUserPermissions(['developer']);
      expect(perms.length).toBeGreaterThan(0);
      // Developer should have pattern read
      expect(perms.some((p) => p.resource === Resources.PATTERN && p.action === Actions.READ)).toBe(
        true
      );
    });

    it('should merge permissions from multiple roles', () => {
      const perms = rbac.getUserPermissions(['viewer', 'developer']);
      expect(perms.length).toBeGreaterThan(rbac.getUserPermissions(['viewer']).length);
    });

    it('should return empty for unknown role', () => {
      const perms = rbac.getUserPermissions(['nonexistent']);
      expect(perms).toEqual([]);
    });
  });

  describe('role management', () => {
    it('should load default roles', () => {
      const roles = rbac.getRoles();
      const roleNames = roles.map((r) => r.name);
      expect(roleNames).toContain('admin');
      expect(roleNames).toContain('developer');
      expect(roleNames).toContain('viewer');
      expect(roleNames).toContain('operator');
    });

    it('should add custom roles', () => {
      rbac.addRole({
        name: 'auditor',
        description: 'Audit access',
        permissions: [{ resource: Resources.METRICS, action: Actions.READ, scope: Scopes.ALL }],
      });
      const role = rbac.getRole('auditor');
      expect(role).toBeDefined();
      expect(role!.name).toBe('auditor');
    });

    it('should accept custom roles in constructor', () => {
      const customRbac = new RBACService(logger, [
        {
          name: 'custom',
          description: 'Custom role',
          permissions: [],
        },
      ]);
      expect(customRbac.getRole('custom')).toBeDefined();
    });
  });

  describe('Permissions constants', () => {
    it('should define agent permissions', () => {
      expect(Permissions.AGENT_CREATE.resource).toBe('agent');
      expect(Permissions.AGENT_CREATE.action).toBe('create');
    });

    it('should define pattern permissions', () => {
      expect(Permissions.PATTERN_EXECUTE.resource).toBe('pattern');
      expect(Permissions.PATTERN_EXECUTE.action).toBe('execute');
    });
  });
});
