import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library bundle
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    external: ['node-pty'],
  },
  // PTY worker (standalone Node.js script for Bun compatibility)
  {
    entry: ['src/pty-worker.ts'],
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    minify: false,
    external: ['node-pty'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
