import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import type { TestProject } from 'vitest/node';

const execFileAsync = promisify(execFile);

export default async function setup(project: TestProject) {
  const env = project.config.env;
  const name = env.TEST_DATABASE_NAME;
  if (!/^parallax_test_[a-f0-9]{32}$/.test(name)) {
    throw new Error(
      'Refusing database setup without a unique generated test database name'
    );
  }
  const admin = new PrismaClient({
    datasources: { db: { url: env.TEST_DATABASE_ADMIN_URL } },
  });
  let created = false;
  const cleanup = async () => {
    try {
      if (created)
        await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await admin.$disconnect();
    }
  };
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: project.config.root,
      env: { ...process.env, ...env },
      timeout: 120000,
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
  return cleanup;
}
