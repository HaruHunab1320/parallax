import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  // CLI
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
