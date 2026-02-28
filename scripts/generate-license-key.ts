#!/usr/bin/env tsx
/**
 * Generate a signed license key for a customer.
 *
 * Usage:
 *   pnpm tsx scripts/generate-license-key.ts \
 *     --private-key ./license-private.pem \
 *     --tier enterprise \
 *     --org "Acme Corp" \
 *     --sub org_abc123 \
 *     --expiry 2027-12-31
 *
 * Options:
 *   --private-key <path>   Path to Ed25519 private key PEM (or set PARALLAX_LICENSE_PRIVATE_KEY env)
 *   --tier <tier>          "enterprise" or "enterprise-plus"
 *   --org <name>           Organization name
 *   --sub <id>             Subject/organization ID
 *   --expiry <date>        ISO date (e.g., 2027-12-31) or "perpetual"
 *   --cluster <id>         Optional cluster ID
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';

// Load .env from repo root (supports multiline quoted values)
const envPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  let currentKey = '';
  let currentValue = '';
  let inMultiline = false;

  for (const line of lines) {
    if (inMultiline) {
      currentValue += '\n' + line;
      if (line.includes('"')) {
        process.env[currentKey] = currentValue.replace(/^"|"$/g, '');
        inMultiline = false;
      }
      continue;
    }
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const key = match[1];
    const val = match[2];
    if (val.startsWith('"') && !val.endsWith('"')) {
      currentKey = key;
      currentValue = val;
      inMultiline = true;
    } else {
      process.env[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }
}

const { values } = parseArgs({
  options: {
    'private-key': { type: 'string' },
    tier: { type: 'string' },
    org: { type: 'string' },
    sub: { type: 'string' },
    expiry: { type: 'string' },
    cluster: { type: 'string' },
  },
});

// Load private key
let privatePem: string;
if (values['private-key']) {
  privatePem = fs.readFileSync(values['private-key'], 'utf-8');
} else if (process.env.PARALLAX_LICENSE_PRIVATE_KEY) {
  privatePem = process.env.PARALLAX_LICENSE_PRIVATE_KEY;
} else {
  console.error('Error: Provide --private-key <path> or set PARALLAX_LICENSE_PRIVATE_KEY env');
  process.exit(1);
}

const tier = values.tier;
if (tier !== 'enterprise' && tier !== 'enterprise-plus') {
  console.error('Error: --tier must be "enterprise" or "enterprise-plus"');
  process.exit(1);
}

const org = values.org;
if (!org) {
  console.error('Error: --org is required');
  process.exit(1);
}

const sub = values.sub;
if (!sub) {
  console.error('Error: --sub is required');
  process.exit(1);
}

const expiryArg = values.expiry;
if (!expiryArg) {
  console.error('Error: --expiry is required (ISO date or "perpetual")');
  process.exit(1);
}

const exp = expiryArg === 'perpetual'
  ? 0
  : Math.floor(new Date(expiryArg).getTime() / 1000);

if (expiryArg !== 'perpetual' && isNaN(exp)) {
  console.error(`Error: Invalid expiry date: ${expiryArg}`);
  process.exit(1);
}

const payload: Record<string, unknown> = {
  iss: 'parallax',
  v: 1,
  tier,
  org,
  sub,
  iat: Math.floor(Date.now() / 1000),
  exp,
};

if (values.cluster) {
  payload.cluster = values.cluster;
}

// Encode payload as base64url
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

// Sign the base64url payload string with Ed25519
const privateKey = crypto.createPrivateKey(privatePem);
const signature = crypto.sign(null, Buffer.from(payloadB64), privateKey);
const signatureB64 = signature.toString('base64url');

const licenseKey = `${payloadB64}.${signatureB64}`;

console.log('=== Signed License Key ===\n');
console.log(licenseKey);
console.log(`\nPayload: ${JSON.stringify(payload, null, 2)}`);
console.log(`\nLength: ${licenseKey.length} chars`);
