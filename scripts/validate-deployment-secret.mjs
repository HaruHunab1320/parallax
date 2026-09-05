#!/usr/bin/env node
/** Validate a Kubernetes Secret from stdin without logging credential material. */
import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';

try {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { data = {} } = JSON.parse(input);
  const read = (key) => {
    if (typeof data[key] !== 'string' || !data[key]) throw new Error(`Missing Secret key: ${key}`);
    return Buffer.from(data[key], 'base64');
  };
  if (process.argv.includes('--tls')) {
    const certificate = new X509Certificate(read('tls.crt'));
    const privateKey = createPrivateKey(read('tls.key'));
    const certificatePublicKey = certificate.publicKey.export({ type: 'spki', format: 'der' });
    const keyPublicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    if (!certificatePublicKey.equals(keyPublicKey)) throw new Error('TLS certificate and private key do not match');
    if (Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) {
      throw new Error('TLS certificate is not currently valid');
    }
  } else {
    for (const key of ['JWT_SECRET', 'PARALLAX_GRPC_API_KEY', 'PARALLAX_RUNTIME_API_KEY']) {
      if (read(key).length < 32) throw new Error(`Secret key ${key} must contain at least 32 bytes`);
    }
    const databaseUrl = new URL(read('DATABASE_URL').toString());
    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) throw new Error('DATABASE_URL must use PostgreSQL');
    if (data.PARALLAX_BOOTSTRAP_TOKEN && read('PARALLAX_BOOTSTRAP_TOKEN').length < 32) {
      throw new Error('PARALLAX_BOOTSTRAP_TOKEN must contain at least 32 bytes');
    }
  }
  console.log('Provisioned Secret passed validation.');
} catch (error) {
  // Crypto/JSON parsers may embed input in messages. Expose only our own errors.
  const safePrefixes = ['Missing Secret key:', 'TLS certificate', 'Secret key ', 'DATABASE_URL must', 'PARALLAX_BOOTSTRAP_TOKEN must'];
  const message = error instanceof Error ? error.message : '';
  console.error(safePrefixes.some((prefix) => message.startsWith(prefix)) ? message : 'Secret contains malformed credential or certificate data');
  process.exitCode = 1;
}
