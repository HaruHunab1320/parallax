import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library build
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    // pty-manager has native bindings via node-pty, can't be bundled
    external: ['pty-manager', 'coding-agent-adapters', 'git-workspace-service'],
  },
  // CLI build
  {
    entry: ['src/cli.ts'],
    format: ['cjs'],
    splitting: false,
    sourcemap: true,
    external: ['pty-manager', 'coding-agent-adapters', 'git-workspace-service'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
