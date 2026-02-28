#!/usr/bin/env tsx
/**
 * One-time setup: generate an Ed25519 keypair for license signing.
 *
 * Usage:
 *   pnpm tsx scripts/generate-license-keypair.ts
 *
 * Output:
 *   - Private key PEM (save offline, never commit)
 *   - Public key as base64-encoded SPKI DER (paste into license-keys.ts)
 */

import crypto from 'crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const publicDer = publicKey.export({ type: 'spki', format: 'der' });
const publicB64 = publicDer.toString('base64');

console.log('=== Ed25519 License Keypair ===\n');

console.log('PRIVATE KEY (save to a secure file, NEVER commit):');
console.log('---');
console.log(privatePem);

console.log('PUBLIC KEY (base64 SPKI DER — paste into license-keys.ts):');
console.log('---');
console.log(publicB64);
console.log('---\n');

console.log('Next steps:');
console.log('  1. Save the private key to a file (e.g., license-private.pem)');
console.log('  2. Replace LICENSE_PUBLIC_KEY_B64 in packages/control-plane/src/licensing/license-keys.ts');
console.log('  3. Use scripts/generate-license-key.ts to issue signed keys');
