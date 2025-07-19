import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Docker from 'dockerode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const docker = new Docker();

// Test database configuration
export const TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/parallax_test?schema=public';
let testContainer: Docker.Container | null = null;
let prisma: PrismaClient | null = null;

// Global setup
beforeAll(async () => {
  console.log('Starting test database container...');
  
  try {
    // Pull TimescaleDB image if not exists
    await docker.pull('timescale/timescaledb:latest-pg16');
    
    // Create test database container
    testContainer = await docker.createContainer({
      Image: 'timescale/timescaledb:latest-pg16',
      name: 'parallax-test-db',
      Env: [
        'POSTGRES_DB=parallax_test',
        'POSTGRES_USER=postgres',
        'POSTGRES_PASSWORD=postgres'
      ],
      HostConfig: {
        PortBindings: {
          '5432/tcp': [{ HostPort: '5433' }]
        },
        AutoRemove: true
      }
    });
    
    await testContainer.start();
    
    // Wait for database to be ready
    let retries = 30;
    while (retries > 0) {
      try {
        await execAsync('PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d parallax_test -c "SELECT 1"');
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw new Error('Test database failed to start');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Set test database URL
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    
    // Initialize Prisma and run migrations
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL
        }
      }
    });
    
    // Run migrations
    await execAsync('pnpm prisma migrate deploy');
    
    console.log('Test database ready');
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
});

// Global teardown
afterAll(async () => {
  console.log('Cleaning up test database...');
  
  // Disconnect Prisma
  if (prisma) {
    await prisma.$disconnect();
  }
  
  // Stop and remove container
  if (testContainer) {
    try {
      await testContainer.stop();
    } catch (error) {
      // Container might already be stopped
    }
  }
});

// Reset database between tests
beforeEach(async () => {
  if (prisma) {
    // Clean all tables
    await prisma.executionEvent.deleteMany();
    await prisma.execution.deleteMany();
    await prisma.confidenceMetric.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.pattern.deleteMany();
    await prisma.patternVersion.deleteMany();
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