import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthRouter } from '../../../src/api/auth';
import { createUsersRouter } from '../../../src/api/users';
import {
  createApiAuthentication,
  createApiAuthorization,
} from '../../../src/auth/api-authorization';
import { AuthService } from '../../../src/auth/auth-service';
import { hashPassword, verifyPassword } from '../../../src/auth/password';
import { getSecurityConfig } from '../../../src/auth/security-config';

const logger = pino({ level: 'silent' });
const secret = randomBytes(32).toString('hex');
const account = (role = 'viewer') => ({
  id: role,
  email: `${role}@example.com`,
  role,
  status: 'active',
  passwordHash: null,
  metadata: null,
});
let prisma: any;
let service: AuthService;
let app: express.Application;
let license: any;
const token = (id = 'viewer', claimedRole = id) =>
  jwt.sign(
    { sub: id, email: `${id}@example.com`, role: claimedRole, type: 'access' },
    secret,
    { expiresIn: '5m' }
  );

beforeEach(() => {
  prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => account(where.id || 'admin')),
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([account()]),
      create: vi.fn().mockResolvedValue(account()),
      update: vi.fn().mockResolvedValue(account()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
    },
    apiKey: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'new-key' }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };
  prisma.$transaction = vi.fn(async (callback: any) => callback(prisma));
  service = new AuthService(prisma, logger, { jwtSecret: secret });
  license = { requireFeature: vi.fn() };
  app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiAuthentication(service, logger),
    createApiAuthorization(logger)
  );
  app.use('/api/users', createUsersRouter(prisma, license, logger));
  app.use('/api/auth', createAuthRouter(service, license, logger));
  for (const path of [
    '/patterns',
    '/patterns/example/execute',
    '/agents/example/test',
    '/managed-agents',
    '/managed-threads/example/send',
    '/executions/example/cancel',
    '/workspaces',
    '/credentials/git',
    '/backup',
    '/license/reload',
    '/unknown',
  ]) {
    app.all(`/api${path}`, (_req, res) => res.json({ allowed: true }));
  }
});
afterEach(() => vi.unstubAllEnvs());

describe('HTTP authorization boundary', () => {
  it('rejects anonymous API access and invalid credentials on setup detection', async () => {
    expect((await request(app).get('/api/patterns')).status).toBe(401);
    expect((await request(app).get('/api/users')).body).toEqual({ count: 1 });
    expect(
      (
        await request(app)
          .get('/api/users')
          .set('Authorization', 'Bearer invalid')
      ).status
    ).toBe(401);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it.each([
    '/patterns/example/execute',
    '/agents/example/test',
    '/managed-agents',
    '/managed-threads/example/send',
    '/executions/example/cancel',
    '/workspaces',
    '/credentials/git',
    '/backup',
    '/license/reload',
  ])('prevents viewer writes to %s', async (path) => {
    expect(
      (
        await request(app)
          .post(`/api${path}`)
          .set('Authorization', `Bearer ${token()}`)
      ).status
    ).toBe(403);
  });

  it('checks current database roles and disabled/deleted accounts rather than token claims', async () => {
    expect(
      (
        await request(app)
          .post('/api/patterns/example/execute')
          .set('Authorization', `Bearer ${token('viewer', 'admin')}`)
      ).status
    ).toBe(403);
    prisma.user.findUnique.mockResolvedValue({
      ...account('admin'),
      status: 'suspended',
    });
    expect(
      (
        await request(app)
          .get('/api/patterns')
          .set('Authorization', `Bearer ${token('admin')}`)
      ).status
    ).toBe(401);
    prisma.user.findUnique.mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get('/api/patterns')
          .set('Authorization', `Bearer ${token('admin')}`)
      ).status
    ).toBe(401);
  });

  it('permits authorized operations and defaults unknown APIs to denied', async () => {
    expect(
      (
        await request(app)
          .get('/api/patterns')
          .set('Authorization', `Bearer ${token()}`)
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/patterns/example/execute')
          .set('Authorization', `Bearer ${token('developer')}`)
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/unknown')
          .set('Authorization', `Bearer ${token('admin')}`)
      ).status
    ).toBe(403);
  });

  it('intersects API key scopes with roles and cannot lose key restrictions in a second lookup', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key',
      user: account('admin'),
      expiresAt: null,
      permissions: ['patterns:read'],
    });
    const key = `plx_${randomBytes(32).toString('hex')}`;
    expect(
      (
        await request(app)
          .get('/api/patterns')
          .set('Authorization', `ApiKey ${key}`)
      ).status
    ).toBe(200);
    expect(prisma.apiKey.findUnique).toHaveBeenCalledTimes(1);
    expect(
      (
        await request(app)
          .post('/api/patterns/example/execute')
          .set('Authorization', `ApiKey ${key}`)
      ).status
    ).toBe(403);
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key',
      user: account(),
      expiresAt: null,
      permissions: ['*:*'],
    });
    expect(
      (
        await request(app)
          .post('/api/patterns/example/execute')
          .set('Authorization', `ApiKey ${key}`)
      ).status
    ).toBe(403);
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key',
      user: account('admin'),
      expiresAt: null,
      permissions: [],
    });
    expect(
      (
        await request(app)
          .get('/api/patterns')
          .set('Authorization', `ApiKey ${key}`)
      ).status
    ).toBe(403);
  });

  it('enforces self-only profile access, admin role changes, and user creation permissions', async () => {
    expect(
      (
        await request(app)
          .put('/api/users/viewer')
          .set('Authorization', `Bearer ${token()}`)
          .send({ role: 'admin' })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .put('/api/users/viewer')
          .set('Authorization', `Bearer ${token()}`)
          .send({ status: 'active', password: randomBytes(16).toString('hex') })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .put('/api/users/admin')
          .set('Authorization', `Bearer ${token()}`)
          .send({ name: 'Changed' })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/users/admin')
          .set('Authorization', `Bearer ${token()}`)
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${token()}`)
          .send({ email: 'new@example.com' })
      ).status
    ).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(
      (
        await request(app)
          .put('/api/users/viewer')
          .set('Authorization', `Bearer ${token()}`)
          .send({ name: 'Updated' })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .put('/api/users/viewer')
          .set('Authorization', `Bearer ${token('admin')}`)
          .send({ role: 'admin' })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .put('/api/users/viewer')
          .set('Authorization', `Bearer ${token('admin')}`)
          .send({ role: 'typo' })
      ).status
    ).toBe(400);
  });

  it('supports self-owned API keys, denies other accounts, invalid scopes, and API-key token minting', async () => {
    const auth = `Bearer ${token()}`;
    expect(
      (
        await request(app)
          .post('/api/users/admin/api-keys')
          .set('Authorization', auth)
          .send({ name: 'test' })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/users/admin/api-keys')
          .set('Authorization', auth)
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete('/api/users/admin/api-keys/key')
          .set('Authorization', auth)
      ).status
    ).toBe(403);
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
    expect(prisma.apiKey.delete).not.toHaveBeenCalled();
    expect(
      (
        await request(app)
          .post('/api/users/viewer/api-keys')
          .set('Authorization', auth)
          .send({ name: 'test', permissions: ['typo:read'] })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/users/viewer/api-keys')
          .set('Authorization', auth)
          .send({ name: 'test', permissions: ['patterns:execute'] })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/users/viewer/api-keys')
          .set('Authorization', auth)
          .send({ name: 'test', permissions: ['patterns:read'] })
      ).status
    ).toBe(201);
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key',
      user: account('admin'),
      permissions: ['api_keys:create'],
      expiresAt: null,
    });
    expect(
      (
        await request(app)
          .post('/api/users/admin/api-keys')
          .set('Authorization', `ApiKey plx_${randomBytes(32).toString('hex')}`)
          .send({ name: 'replacement' })
      ).status
    ).toBe(403);
  });
});

describe('Authentication and password migration', () => {
  it('hashes passwords using scrypt with unique salts and safely rejects malformed records', async () => {
    const password = randomBytes(16).toString('hex');
    const [one, two] = await Promise.all([
      hashPassword(password),
      hashPassword(password),
    ]);
    expect(one).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(one).not.toBe(two);
    expect(await verifyPassword(password, one)).toBe(true);
    expect(await verifyPassword(`${password}x`, one)).toBe(false);
    expect(
      await verifyPassword(password, one.replace('131072', '99999999'))
    ).toBe(false);
    expect(await verifyPassword(password, 'broken:hash')).toBe(false);
  });

  it('upgrades a valid weak legacy password and does not upgrade an incorrect password', async () => {
    const password = randomBytes(2).toString('hex'); // Previously accepted by user-management API.
    const salt = randomBytes(16).toString('hex');
    const legacy = `${salt}:${createHash('sha256')
      .update(salt + password)
      .digest('hex')}`;
    prisma.user.findUnique.mockResolvedValue({
      ...account('admin'),
      passwordHash: legacy,
      metadata: { passwordResetToken: randomBytes(32).toString('hex') },
    });
    await expect(
      service.login('admin@example.com', `${password}x`)
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    const result = await service.login('admin@example.com', password);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'admin', passwordHash: legacy },
      data: { passwordHash: expect.stringMatching(/^scrypt\$/) },
    });
    expect(result.user.metadata).toBeNull();
  });

  it('allows first-admin bootstrap without an enterprise license and serializes the creation', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PARALLAX_BOOTSTRAP_TOKEN', '');
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.count.mockResolvedValue(0);
    prisma.user.create.mockResolvedValue(account('admin'));
    license.requireFeature.mockImplementation(() => {
      throw new Error('Not licensed');
    });
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'admin@example.com',
        password: `${randomBytes(16).toString('hex')}A1`,
      });
    expect(response.status).toBe(201);
    expect(license.requireFeature).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: 'admin',
        passwordHash: expect.stringMatching(/^scrypt\$/),
      }),
    });
    prisma.user.count.mockResolvedValue(1);
    expect(
      (
        await request(app)
          .post('/api/auth/register')
          .send({
            email: 'second@example.com',
            password: `${randomBytes(16).toString('hex')}A1`,
          })
      ).status
    ).toBe(403);
  });

  it('requires production bootstrap token before any database or password work', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PARALLAX_BOOTSTRAP_TOKEN', randomBytes(32).toString('hex'));
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'admin@example.com',
        password: `${randomBytes(16).toString('hex')}A1`,
      });
    expect(response.status).toBe(403);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('never exposes password-reset tokens from unauthenticated development routes', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'admin@example.com' });
    expect(response.status).toBe(503);
    expect(response.body._devToken).toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('validates malformed auth input and bounds public authentication attempts', async () => {
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: {}, password: {} })
      ).status
    ).toBe(400);
    for (let i = 0; i < 30; i++)
      await request(app).post('/api/auth/login').send({});
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(
      429
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('secure startup configuration', () => {
  it('requires service credentials by default and prohibits public/production development mode', () => {
    expect(() => getSecurityConfig({})).toThrow('PARALLAX_GRPC_API_KEY');
    expect(
      getSecurityConfig({ PARALLAX_AUTH_MODE: 'development' })
    ).toMatchObject({
      development: true,
      httpHost: '127.0.0.1',
      grpcHost: '127.0.0.1',
    });
    expect(() =>
      getSecurityConfig({
        PARALLAX_AUTH_MODE: 'development',
        NODE_ENV: 'production',
      })
    ).toThrow('forbidden');
    expect(() =>
      getSecurityConfig({
        PARALLAX_AUTH_MODE: 'development',
        PARALLAX_HTTP_HOST: '0.0.0.0',
      })
    ).toThrow('loopback');
    expect(() => getSecurityConfig({ PARALLAX_AUTH_MODE: 'disabled' })).toThrow(
      'required or development'
    );
    expect(() =>
      getSecurityConfig({
        NODE_ENV: 'production',
        PARALLAX_GRPC_API_KEY: secret,
      })
    ).toThrow('TLS');
  });
});
