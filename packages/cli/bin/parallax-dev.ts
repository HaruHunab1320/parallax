#!/usr/bin/env tsx

process.argv = process.argv.filter(arg => arg !== '--');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'ESNext' });

import('tsx/esm').then(() => import('../src/index.ts'));
