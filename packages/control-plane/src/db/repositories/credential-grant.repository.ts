/**
 * Credential Grant Repository
 *
 * Database operations for credential grants.
 */

import { PrismaClient, CredentialGrant } from '@prisma/client';

export interface CreateCredentialGrantInput {
  id: string;
  type: string;
  repo: string;
  provider: string;
  executionId: string;
  taskId?: string;
  agentId?: string;
  permissions: string[];
  reason?: string;
  expiresAt: Date;
}

export interface CredentialGrantRepository {
  create(input: CreateCredentialGrantInput): Promise<CredentialGrant>;
  findById(id: string): Promise<CredentialGrant | null>;
  findByExecutionId(executionId: string): Promise<CredentialGrant[]>;
  findByRepo(repo: string): Promise<CredentialGrant[]>;
  revoke(id: string): Promise<CredentialGrant | null>;
  revokeForExecution(executionId: string): Promise<number>;
  updateUsage(id: string): Promise<CredentialGrant | null>;
  findActive(): Promise<CredentialGrant[]>;
  findExpired(): Promise<CredentialGrant[]>;
  deleteExpired(olderThan: Date): Promise<number>;
}

export function createCredentialGrantRepository(
  prisma: PrismaClient
): CredentialGrantRepository {
  return {
    async create(input: CreateCredentialGrantInput): Promise<CredentialGrant> {
      return prisma.credentialGrant.create({
        data: {
          id: input.id,
          type: input.type,
          repo: input.repo,
          provider: input.provider,
          executionId: input.executionId,
          taskId: input.taskId,
          agentId: input.agentId,
          permissions: input.permissions,
          reason: input.reason,
          expiresAt: input.expiresAt,
        },
      });
    },

    async findById(id: string): Promise<CredentialGrant | null> {
      return prisma.credentialGrant.findUnique({
        where: { id },
      });
    },

    async findByExecutionId(executionId: string): Promise<CredentialGrant[]> {
      return prisma.credentialGrant.findMany({
        where: { executionId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async findByRepo(repo: string): Promise<CredentialGrant[]> {
      return prisma.credentialGrant.findMany({
        where: { repo },
        orderBy: { createdAt: 'desc' },
      });
    },

    async revoke(id: string): Promise<CredentialGrant | null> {
      return prisma.credentialGrant.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
    },

    async revokeForExecution(executionId: string): Promise<number> {
      const result = await prisma.credentialGrant.updateMany({
        where: {
          executionId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return result.count;
    },

    async updateUsage(id: string): Promise<CredentialGrant | null> {
      return prisma.credentialGrant.update({
        where: { id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      });
    },

    async findActive(): Promise<CredentialGrant[]> {
      return prisma.credentialGrant.findMany({
        where: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    async findExpired(): Promise<CredentialGrant[]> {
      return prisma.credentialGrant.findMany({
        where: {
          OR: [
            { revokedAt: { not: null } },
            { expiresAt: { lte: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    async deleteExpired(olderThan: Date): Promise<number> {
      const result = await prisma.credentialGrant.deleteMany({
        where: {
          OR: [
            { revokedAt: { not: null } },
            { expiresAt: { lte: new Date() } },
          ],
          createdAt: { lt: olderThan },
        },
      });
      return result.count;
    },
  };
}
