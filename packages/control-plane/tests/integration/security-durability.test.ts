import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createAuthRouter } from '../../src/api/auth';
import { AuthService } from '../../src/auth/auth-service';
import { ExecutionRepository } from '../../src/db/repositories/execution.repository';
import { LicenseEnforcer } from '../../src/licensing/license-enforcer';
import {
  createTestExecution,
  createTestPattern,
  getTestPrisma,
  TEST_DATABASE_URL,
} from '../setup';

const logger = pino({ level: 'silent' });

describe('PostgreSQL security and execution durability', () => {
  it('permits exactly one first administrator across concurrent service instances', async () => {
    const secondConnection = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    const bootstrapToken = randomBytes(32).toString('hex');
    vi.stubEnv('PARALLAX_BOOTSTRAP_TOKEN', bootstrapToken);
    try {
      const applications = [getTestPrisma(), secondConnection].map((client) => {
        const app = express();
        app.use(express.json());
        app.use(
          '/auth',
          createAuthRouter(
            new AuthService(client, logger),
            new LicenseEnforcer(logger),
            logger
          )
        );
        return app;
      });
      const responses = await Promise.all(
        applications.map((app, index) =>
          request(app)
            .post('/auth/register')
            .set('X-Parallax-Bootstrap-Token', bootstrapToken)
            .send({
              email: `admin-${index}@example.test`,
              password: 'Valid-Test-Password-932!',
            })
        )
      );
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 403,
      ]);
      expect(
        responses.find((response) => response.status === 403)?.body.code
      ).toBe('REGISTRATION_CLOSED');
      const users = await getTestPrisma().user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0].role).toBe('admin');
      expect(users[0].passwordHash).toMatch(/^scrypt\$/);
      expect(
        responses.find((response) => response.status === 201)?.body.tokens
          .accessToken
      ).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
      await secondConnection.$disconnect();
    }
  });

  it('allows only one concurrent terminal transition and preserves its result', async () => {
    const secondConnection = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    try {
      const pattern = await createTestPattern();
      const execution = await createTestExecution(pattern.id);
      const repositories = [getTestPrisma(), secondConnection].map(
        (client) => new ExecutionRepository(client, logger)
      );
      const outcomes = await Promise.all([
        repositories[0].transitionStatus(execution.id, 'completed', {
          result: { outcome: 'completed' },
        }),
        repositories[1].transitionStatus(execution.id, 'cancelled', {
          error: 'Cancelled by operator',
        }),
      ]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      const stored = await getTestPrisma().execution.findUniqueOrThrow({
        where: { id: execution.id },
      });
      expect(stored.status).toBe(outcomes[0] ? 'completed' : 'cancelled');
      expect(
        await repositories[0].markOrphaned(execution.id, 'late recovery')
      ).toBe(false);
      await expect(
        repositories[1].updateStatus(execution.id, 'failed')
      ).rejects.toThrow();
      expect(
        await getTestPrisma().execution.findUniqueOrThrow({
          where: { id: execution.id },
        })
      ).toEqual(stored);
    } finally {
      await secondConnection.$disconnect();
    }
  });

  it('limits orphan queries to an explicitly identified owner', async () => {
    const pattern = await createTestPattern();
    const stopped = await createTestExecution(pattern.id, {
      nodeId: 'stopped-owner',
    });
    await createTestExecution(pattern.id, { nodeId: 'healthy-owner' });
    await createTestExecution(pattern.id, { nodeId: null });
    const repository = new ExecutionRepository(getTestPrisma(), logger);
    expect(await repository.findOrphanedExecutions()).toEqual([]);
    expect(
      (await repository.findOrphanedExecutions('stopped-owner')).map(
        (execution) => execution.id
      )
    ).toEqual([stopped.id]);
  });
});
