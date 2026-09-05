import { randomUUID } from 'node:crypto';
import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// Never inherit a developer's DATABASE_URL. Each invocation owns a new database.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
if (!adminUrl) {
  throw new Error(
    'Set TEST_DATABASE_ADMIN_URL or run pnpm test:db:isolated from the repository root.'
  );
}
const databaseName = `parallax_test_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
databaseUrl.searchParams.set('schema', 'public');

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    // Object replacement is deliberate: mergeConfig concatenates the base
    // include/exclude arrays and otherwise silently excludes every DB test.
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/db-global-setup.ts'],
    include: [
      'src/api/__tests__/api.test.ts',
      'tests/unit/db/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/e2e/**/*.test.ts',
    ],
    exclude: ['node_modules/**', 'dist/**'],
    fileParallelism: false,
    env: {
      ...baseConfig.test?.env,
      DATABASE_URL: databaseUrl.toString(),
      TEST_DATABASE_URL: databaseUrl.toString(),
      TEST_DATABASE_NAME: databaseName,
      TEST_DATABASE_ADMIN_URL: adminUrl,
    },
  },
});
