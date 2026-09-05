import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import './setup-env';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL!;
const databaseName = new URL(TEST_DATABASE_URL).pathname.slice(1);
if (!/^parallax_test_[a-f0-9]{32}$/.test(databaseName)) {
  throw new Error(
    'Database tests require the isolated vitest.db.config.ts configuration'
  );
}
process.env.DATABASE_URL = TEST_DATABASE_URL;
let prisma: PrismaClient | null = null;

beforeAll(async () => {
  prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
  });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
  prisma = null;
});

beforeEach(async () => {
  const client = getTestPrisma();
  // The database is created for this invocation only. Include every migrated
  // application table; failed cleanup must fail the test rather than leak state.
  const tables = await client.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const identifiers = tables.map(
    ({ tablename }) => `"${tablename.replaceAll('"', '""')}"`
  );
  if (identifiers.length > 0) {
    await client.$executeRawUnsafe(
      `TRUNCATE TABLE ${identifiers.join(', ')} RESTART IDENTITY CASCADE`
    );
  }
});

// Export test utilities
export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error('Test database not initialized');
  }
  return prisma;
}

export async function createTestPattern(overrides?: Partial<any>) {
  const prisma = getTestPrisma();
  return prisma.pattern.create({
    data: {
      name: 'test-pattern',
      version: '1.0.0',
      description: 'Test pattern',
      script: 'pattern test { }',
      ...overrides,
    },
  });
}

export async function createTestAgent(overrides?: Partial<any>) {
  const prisma = getTestPrisma();
  return prisma.agent.create({
    data: {
      name: 'test-agent',
      endpoint: 'http://localhost:8080',
      capabilities: ['test', 'analyze'],
      status: 'active',
      ...overrides,
    },
  });
}

export async function createTestExecution(
  patternId: string,
  overrides?: Partial<any>
) {
  const prisma = getTestPrisma();
  return prisma.execution.create({
    data: {
      patternId,
      input: { test: 'data' },
      status: 'running',
      ...overrides,
    },
  });
}
