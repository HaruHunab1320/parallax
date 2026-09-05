/** User and API-key management. Identity comes from the authentication boundary. */
import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { type RequestHandler, Router } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import {
  hashPassword,
  PasswordServiceBusyError,
  passwordSchema,
} from '../auth/password';
import {
  canAccessUser,
  checkApiKeyPermission,
  createRBACMiddleware,
  getRolePermissions,
  hasPermission,
  type Role,
} from '../auth/rbac';
import type { LicenseEnforcer } from '../licensing/license-enforcer';

const roleSchema = z
  .enum(['admin', 'operator', 'developer', 'viewer'])
  .describe('Account role');
const scopesSchema = z
  .union([
    z.array(
      z
        .string()
        .regex(
          /^(\*|patterns|agents|executions|schedules|triggers|users|api_keys|license|settings):(\*|create|read|update|delete|execute|manage)$/
        )
    ),
    z.record(
      z.enum([
        'patterns',
        'agents',
        'executions',
        'schedules',
        'triggers',
        'users',
        'api_keys',
        'license',
        'settings',
      ]),
      z.union([
        z.literal('*'),
        z.array(
          z.enum([
            '*',
            'create',
            'read',
            'update',
            'delete',
            'execute',
            'manage',
          ])
        ),
      ])
    ),
  ])
  .describe(
    'Scope restrictions intersected with the account role on every request'
  );
const createUserSchema = z
  .object({
    email: z
      .string()
      .email()
      .transform((value) => value.toLowerCase()),
    name: z.string().max(200).optional(),
    role: roleSchema.default('viewer'),
    password: passwordSchema.optional(),
  })
  .strict();
const updateUserSchema = z
  .object({
    name: z.string().max(200).optional(),
    role: roleSchema.optional(),
    status: z.enum(['active', 'pending', 'inactive', 'suspended']).optional(),
    password: passwordSchema.optional(),
  })
  .strict();
const createKeySchema = z
  .object({
    name: z.string().min(1).max(200),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .refine(
        (value) => new Date(value) > new Date(),
        'Expiry must be in the future'
      )
      .optional(),
    permissions: scopesSchema.optional(),
  })
  .strict();
const publicUserFields = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  ssoProvider: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
const publicKeyFields = {
  id: true,
  name: true,
  keyPrefix: true,
  permissions: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

function validateBody(schema: z.ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.flatten(),
        code: 'INVALID_INPUT',
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function createUsersRouter(
  prisma: PrismaClient,
  licenseEnforcer: LicenseEnforcer,
  logger: Logger
): Router {
  const router = Router();
  const log = logger.child({ component: 'UsersAPI' });
  const permission = (action: 'create' | 'read' | 'update' | 'delete') =>
    createRBACMiddleware(logger, { resource: 'users', action });
  const selfOrAdmin: RequestHandler = (req, res, next) => {
    if (!req.user) {
      res
        .status(401)
        .json({ error: 'Authentication required', code: 'NO_AUTH' });
      return;
    }
    if (
      !canAccessUser(
        req.user.sub,
        req.user.role as Role,
        req.params.id as string
      )
    ) {
      res
        .status(403)
        .json({ error: 'You cannot access this account', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
  // A scoped API key must not mint a less-restricted replacement or change credentials.
  const accountSessionOnly: RequestHandler = (req, res, next) => {
    if (req.apiKey) {
      res.status(403).json({
        error: 'Account session required',
        code: 'API_KEY_NOT_ALLOWED',
      });
      return;
    }
    next();
  };
  const errorResponse = (
    res: Parameters<RequestHandler>[1],
    error: unknown
  ) => {
    log.error({ error }, 'User management operation failed');
    if (error instanceof PasswordServiceBusyError) {
      res.status(503).json({ error: error.message, code: error.code });
      return;
    }
    const code = (error as { code?: string }).code;
    const status =
      code === 'P2025' || code === 'P2003' ? 404 : code === 'P2002' ? 409 : 500;
    res.status(status).json({
      error:
        status === 404
          ? 'Record not found'
          : status === 409
            ? 'Record already exists'
            : 'User management operation failed',
    });
  };

  router.get('/', async (req, res) => {
    if (!req.user) {
      try {
        res.json({ count: await prisma.user.count() });
      } catch (error) {
        errorResponse(res, error);
      }
      return;
    }
    permission('read')(req, res, () => {
      void (async () => {
        const parsed = z
          .object({
            status: z
              .enum(['active', 'pending', 'inactive', 'suspended'])
              .optional(),
            role: roleSchema.optional(),
            limit: z.coerce.number().int().min(1).max(100).default(100),
            offset: z.coerce.number().int().min(0).optional(),
          })
          .safeParse(req.query);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid query' });
          return;
        }
        const { status, role, limit, offset } = parsed.data;
        const users = await prisma.user.findMany({
          where: { status, role },
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
          select: publicUserFields,
        });
        res.json({ users, count: users.length });
      })().catch((error) => errorResponse(res, error));
    });
  });

  router.post(
    '/',
    permission('create'),
    accountSessionOnly,
    validateBody(createUserSchema),
    async (req, res) => {
      try {
        licenseEnforcer.requireFeature(
          'multi_user',
          'Additional user accounts'
        );
      } catch {
        res.status(403).json({
          error: 'Additional user accounts require the multi_user feature',
          code: 'FEATURE_NOT_AVAILABLE',
        });
        return;
      }
      try {
        const { email, name, role, password } = req.body;
        const user = await prisma.user.create({
          data: {
            email,
            name,
            role,
            status: password ? 'active' : 'pending',
            passwordHash: password ? await hashPassword(password) : null,
          },
          select: publicUserFields,
        });
        log.info({ userId: user.id }, 'User created');
        res.status(201).json(user);
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  router.get('/me', async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    // A key scope must also permit account-profile reads.
    if (
      req.apiKey &&
      !checkApiKeyPermission(req.apiKey.permissions, 'users', 'read')
    ) {
      res.status(403).json({ error: 'API key lacks user read scope' });
      return;
    }
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: publicUserFields,
      });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.get('/:id', selfOrAdmin, accountSessionOnly, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id as string },
        select: publicUserFields,
      });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    } catch (error) {
      errorResponse(res, error);
    }
  });

  router.put(
    '/:id',
    selfOrAdmin,
    accountSessionOnly,
    (req, res, next) => {
      if (
        req.user?.role !== 'admin' &&
        Object.keys(req.body || {}).some((key) => key !== 'name')
      ) {
        res.status(403).json({
          error:
            'Only administrators can change roles, status, or reset passwords; use change-password for your own password',
          code: 'FORBIDDEN',
        });
        return;
      }
      next();
    },
    validateBody(updateUserSchema),
    async (req, res) => {
      try {
        const { password, ...data } = req.body;
        const user = await prisma.user.update({
          where: { id: req.params.id as string },
          data: {
            ...data,
            ...(password !== undefined
              ? { passwordHash: await hashPassword(password) }
              : {}),
          },
          select: publicUserFields,
        });
        log.info({ actor: req.user?.sub, userId: user.id }, 'User updated');
        res.json(user);
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  router.delete(
    '/:id',
    permission('delete'),
    accountSessionOnly,
    async (req, res) => {
      try {
        await prisma.user.delete({ where: { id: req.params.id as string } });
        res.status(204).send();
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  router.post(
    '/:id/api-keys',
    selfOrAdmin,
    accountSessionOnly,
    validateBody(createKeySchema),
    async (req, res) => {
      try {
        const { name, expiresAt, permissions } = req.body;
        const target = await prisma.user.findUnique({
          where: { id: req.params.id as string },
        });
        if (!target) {
          res.status(404).json({ error: 'User not found' });
          return;
        }
        if (
          permissions !== undefined &&
          getRolePermissions('admin').some(
            ({ resource, action }) =>
              checkApiKeyPermission(permissions, resource, action) &&
              !hasPermission(target.role as Role, resource, action)
          )
        ) {
          res.status(400).json({
            error: 'API key scopes exceed the target account role',
            code: 'INVALID_INPUT',
          });
          return;
        }

        const rawKey = `plx_${randomBytes(32).toString('hex')}`;
        const apiKey = await prisma.apiKey.create({
          data: {
            userId: req.params.id as string,
            name,
            keyHash: createHash('sha256').update(rawKey).digest('hex'),
            keyPrefix: rawKey.slice(0, 12),
            permissions,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
          select: publicKeyFields,
        });
        log.info(
          { actor: req.user?.sub, userId: req.params.id, keyId: apiKey.id },
          'API key created'
        );
        res.status(201).json({
          ...apiKey,
          key: rawKey,
          warning: 'Save this key securely. It will not be shown again.',
        });
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  router.get(
    '/:id/api-keys',
    selfOrAdmin,
    accountSessionOnly,
    async (req, res) => {
      try {
        const apiKeys = await prisma.apiKey.findMany({
          where: { userId: req.params.id as string },
          select: publicKeyFields,
          orderBy: { createdAt: 'desc' },
        });
        res.json({ apiKeys, count: apiKeys.length });
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );

  router.delete(
    '/:id/api-keys/:keyId',
    selfOrAdmin,
    accountSessionOnly,
    async (req, res) => {
      try {
        await prisma.apiKey.delete({
          where: {
            id: req.params.keyId as string,
            userId: req.params.id as string,
          },
        });
        res.status(204).send();
      } catch (error) {
        errorResponse(res, error);
      }
    }
  );
  return router;
}

export { verifyPassword } from '../auth/password';
