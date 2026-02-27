import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Use the existing parallax TimescaleDB container (root docker-compose on port 5435)
// Falls back to a dedicated test container on port 5433 if available
const DB_HOST = process.env.TEST_DB_HOST || 'localhost';
const DB_PORT = process.env.TEST_DB_PORT || '5435';
const DB_USER = process.env.TEST_DB_USER || 'parallax';
const DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'parallax123';
const DB_NAME = 'parallax_test';

export const TEST_DATABASE_URL = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public`;
let prisma: PrismaClient | null = null;

// Configure infrastructure endpoints for integration tests
// (envFile: false in vitest.config.ts prevents .env from loading)
process.env.PARALLAX_ETCD_ENDPOINTS = process.env.PARALLAX_ETCD_ENDPOINTS || 'localhost:2389';
process.env.PARALLAX_PATTERNS_DIR = process.env.PARALLAX_PATTERNS_DIR || '../../patterns';
process.env.PARALLAX_LICENSE_KEY = process.env.PARALLAX_LICENSE_KEY || 'PARALLAX-ENT-dev-test-1234';

// Global setup
beforeAll(async () => {
  console.log(`Connecting to test database at ${DB_HOST}:${DB_PORT}...`);

  try {
    // Create the test database if it doesn't exist (connect to default db first)
    const adminUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/parallax`;
    const adminPrisma = new PrismaClient({
      datasources: { db: { url: adminUrl } }
    });

    try {
      await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${DB_NAME}`);
      console.log(`Created test database '${DB_NAME}'`);
    } catch (error: any) {
      // Database already exists — that's fine
      if (!error.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await adminPrisma.$disconnect();
    }

    // Set test database URL for Prisma CLI
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    // Run migrations against the test database
    await execAsync('pnpm prisma migrate deploy');

    // Initialize Prisma client for tests
    prisma = new PrismaClient({
      datasources: {
        db: { url: TEST_DATABASE_URL }
      }
    });

    await prisma.$connect();
    console.log('Test database ready');
  } catch (error) {
    console.error('Failed to setup test database:', error);
    // Don't throw — tests that need DB will fail via getTestPrisma() guard
  }
});

// Global teardown
afterAll(async () => {
  console.log('Cleaning up test database...');

  if (prisma) {
    await prisma.$disconnect();
  }
});

// Reset database between tests
beforeEach(async () => {
  if (prisma) {
    // Clean all tables — order matters for FK constraints
    // Use try/catch since async executions may create records concurrently
    try {
      await prisma.executionEvent.deleteMany();
      await prisma.execution.deleteMany();
      await prisma.confidenceMetric.deleteMany();
      await prisma.patternVersion.deleteMany();
      await prisma.pattern.deleteMany();
      await prisma.agent.deleteMany();
    } catch {
      // Retry once after a brief delay (async background work may have created records)
      await new Promise(r => setTimeout(r, 100));
      await prisma.executionEvent.deleteMany().catch(() => {});
      await prisma.execution.deleteMany().catch(() => {});
      await prisma.confidenceMetric.deleteMany().catch(() => {});
      await prisma.patternVersion.deleteMany().catch(() => {});
      await prisma.pattern.deleteMany().catch(() => {});
      await prisma.agent.deleteMany().catch(() => {});
    }
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
      ...overrides
    }
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
      ...overrides
    }
  });
}

export async function createTestExecution(patternId: string, overrides?: Partial<any>) {
  const prisma = getTestPrisma();
  return prisma.execution.create({
    data: {
      patternId,
      input: { test: 'data' },
      status: 'running',
      ...overrides
    }
  });
}
