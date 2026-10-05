import { createRequire } from 'node:module';
import base from '../../eslint.config.mjs';

const require = createRequire(import.meta.url);
const next = require('@next/eslint-plugin-next');

export default [
  ...base,
  { ignores: ['next-env.d.ts'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@next/next': next },
    rules: { ...next.configs.recommended.rules, ...next.configs['core-web-vitals'].rules },
  },
];
