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
    external: ['node-pty'], // node-pty has native bindings, can't be bundled
    // Bundle all @parallax/* packages inline for standalone distribution
    noExternal: [
      '@parallax/runtime-mcp',
      '@parallax/runtime-local',
      '@parallax/runtime-interface',
      '@parallax/auth',
      '@parallax/pty-agent-manager',
    ],
  },
  // CLI build
  {
    entry: ['src/cli.ts'],
    format: ['cjs'],
    splitting: false,
    sourcemap: true,
    external: ['node-pty'],
    // Bundle all @parallax/* packages inline for standalone distribution
    noExternal: [
      '@parallax/runtime-mcp',
      '@parallax/runtime-local',
      '@parallax/runtime-interface',
      '@parallax/auth',
      '@parallax/pty-agent-manager',
    ],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
