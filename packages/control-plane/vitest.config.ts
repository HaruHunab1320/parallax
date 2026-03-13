import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup-env.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'src/api/__tests__/api.test.ts',
      'tests/unit/db/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/e2e/**/*.test.ts',
    ],
    // Override .env runtime URLs that cause ECONNREFUSED in tests
    env: {
      PARALLAX_LOCAL_RUNTIME_URL: '',
      PARALLAX_DOCKER_RUNTIME_URL: '',
      PARALLAX_K8S_RUNTIME_URL: '',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        'src/generated/**'
      ],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 80,
        statements: 80
      }
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
