import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ['./tests/setup.ts'],
      include: [
        'src/api/__tests__/api.test.ts',
        'tests/unit/db/**/*.test.ts',
        'tests/integration/**/*.test.ts',
        'tests/e2e/**/*.test.ts',
      ],
      exclude: [],
    },
  })
);
