/**
 * Users API Router
 *
 * REST API endpoints for user management.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';
import { LicenseEnforcer } from '../licensing/license-enforcer';
import { createHash, randomBytes } from 'crypto';

export function createUsersRouter(
  prisma: PrismaClient,
  licenseEnforcer: LicenseEnforcer,
  logger: Logger
): Router {
  const router = Router();
  const log = logger.child({ component: 'UsersAPI' });

  // Middleware to check enterprise license
  const requireMultiUser = (_req: any, res: any, next: any) => {
    try {
      licenseEnforcer.requireFeature('multi_user', 'Multi-User');
      next();
    } catch (error: any) {
      log.warn('Multi-user feature not available');
      return res.status(403).json({
        error: error.message,
        upgradeUrl: error.upgradeUrl || 'https://parallax.ai/enterprise',
      });
    }
  };

  // Apply license check to all routes
  router.use(requireMultiUser);

  /**
   * GET /users
   * List all users
   */
  router.get('/', async (req: any, res: any) => {
    try {
      const { status, role, limit, offset } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (role) where.role = role;

      const users = await prisma.user.findMany({
        where,
        take: limit ? parseInt(limit, 10) : 100,
        skip: offset ? parseInt(offset, 10) : undefined,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          ssoProvider: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.json({
        users,
        count: users.length,
      });
    } catch (error) {
      log.error({ error }, 'Failed to list users');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list users',
      });
    }
  });

  /**
   * POST /users
   * Create a new user
   */
  router.post('/', async (req: any, res: any) => {
    try {
      const { email, name, role, password } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Check if user already exists
      const existing = await prisma.user.findUnique({
        where: { email },
      });

      if (existing) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      const user = await prisma.user.create({
        data: {
          email,
          name,
          role: role || 'viewer',
          status: 'pending',
          passwordHash: password ? hashPassword(password) : null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });

      log.info({ userId: user.id, email }, 'User created via API');

      return res.status(201).json(user);
    } catch (error) {
      log.error({ error }, 'Failed to create user');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create user',
      });
    }
  });

  /**
   * GET /users/me
   * Get current user (from auth token)
   */
  router.get('/me', async (req: any, res: any) => {
    try {
      // Get user from auth context (would be set by auth middleware)
      const userId = req.user?.sub;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json(user);
    } catch (error) {
      log.error({ error }, 'Failed to get current user');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get user',
      });
    }
  });

  /**
   * GET /users/:id
   * Get a user by ID
   */
  router.get('/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          ssoProvider: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          metadata: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json(user);
    } catch (error) {
      log.error({ error, userId: req.params.id }, 'Failed to get user');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get user',
      });
    }
  });

  /**
   * PUT /users/:id
   * Update a user
   */
  router.put('/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { name, role, status, password, metadata } = req.body;

      const data: any = {};
      if (name !== undefined) data.name = name;
      if (role !== undefined) data.role = role;
      if (status !== undefined) data.status = status;
      if (password !== undefined) data.passwordHash = hashPassword(password);
      if (metadata !== undefined) data.metadata = metadata;

      const user = await prisma.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          updatedAt: true,
        },
      });

      log.info({ userId: id }, 'User updated via API');

      return res.json(user);
    } catch (error) {
      log.error({ error, userId: req.params.id }, 'Failed to update user');

      if ((error as any).code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update user',
      });
    }
  });

  /**
   * DELETE /users/:id
   * Delete a user
   */
  router.delete('/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;

      await prisma.user.delete({
        where: { id },
      });

      log.info({ userId: id }, 'User deleted via API');

      return res.status(204).send();
    } catch (error) {
      log.error({ error, userId: req.params.id }, 'Failed to delete user');

      if ((error as any).code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete user',
      });
    }
  });

  /**
   * POST /users/:id/api-keys
   * Create an API key for a user
   */
  router.post('/:id/api-keys', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { name, expiresAt, permissions } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'API key name is required' });
      }

      // Generate API key
      const rawKey = `plx_${randomBytes(32).toString('hex')}`;
      const keyHash = createHash('sha256').update(rawKey).digest('hex');
      const keyPrefix = rawKey.slice(0, 12);

      const apiKey = await prisma.apiKey.create({
        data: {
          userId: id,
          name,
          keyHash,
          keyPrefix,
          permissions,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          permissions: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      log.info({ userId: id, keyId: apiKey.id }, 'API key created');

      // Return the raw key only once - it cannot be retrieved later
      return res.status(201).json({
        ...apiKey,
        key: rawKey, // Only shown once!
        warning: 'Save this key securely. It will not be shown again.',
      });
    } catch (error) {
      log.error({ error, userId: req.params.id }, 'Failed to create API key');

      if ((error as any).code === 'P2003') {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create API key',
      });
    }
  });

  /**
   * GET /users/:id/api-keys
   * List API keys for a user
   */
  router.get('/:id/api-keys', async (req: any, res: any) => {
    try {
      const { id } = req.params;

      const apiKeys = await prisma.apiKey.findMany({
        where: { userId: id },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          permissions: true,
          expiresAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({
        apiKeys,
        count: apiKeys.length,
      });
    } catch (error) {
      log.error({ error, userId: req.params.id }, 'Failed to list API keys');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list API keys',
      });
    }
  });

  /**
   * DELETE /users/:id/api-keys/:keyId
   * Revoke an API key
   */
  router.delete('/:id/api-keys/:keyId', async (req: any, res: any) => {
    try {
      const { id, keyId } = req.params;

      await prisma.apiKey.delete({
        where: {
          id: keyId,
          userId: id, // Ensure the key belongs to this user
        },
      });

      log.info({ userId: id, keyId }, 'API key revoked');

      return res.status(204).send();
    } catch (error) {
      log.error({ error, userId: req.params.id, keyId: req.params.keyId }, 'Failed to revoke API key');

      if ((error as any).code === 'P2025') {
        return res.status(404).json({ error: 'API key not found' });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to revoke API key',
      });
    }
  });

  return router;
}

/**
 * Hash a password with a random salt
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  const inputHash = createHash('sha256').update(salt + password).digest('hex');
  return hash === inputHash;
}
