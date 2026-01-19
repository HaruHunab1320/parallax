#!/usr/bin/env tsx

process.argv = process.argv.filter(arg => arg !== '--');

import '../src/index.ts';
