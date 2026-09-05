import crypto from 'node:crypto';

// Security stays enabled in tests; credentials are ephemeral, never checked in.
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('base64');
process.env.PARALLAX_GRPC_API_KEY ||= crypto.randomBytes(32).toString('base64');

// Configure infrastructure endpoints for tests
process.env.PARALLAX_ETCD_ENDPOINTS =
  process.env.PARALLAX_ETCD_ENDPOINTS || 'localhost:2389';
process.env.PARALLAX_PATTERNS_DIR =
  process.env.PARALLAX_PATTERNS_DIR || '../../patterns';

// Generate a signed test license key using a fresh Ed25519 keypair
const testKeypair = crypto.generateKeyPairSync('ed25519');
const testPublicKeyB64 = testKeypair.publicKey
  .export({ type: 'spki', format: 'der' })
  .toString('base64');
const testPayload = {
  iss: 'parallax',
  v: 1,
  tier: 'enterprise',
  org: 'Test Org',
  sub: 'test_dev_001',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
};
const testPayloadB64 = Buffer.from(JSON.stringify(testPayload)).toString(
  'base64url'
);
const testSignature = crypto.sign(
  null,
  Buffer.from(testPayloadB64),
  testKeypair.privateKey
);
const testLicenseKey = `${testPayloadB64}.${testSignature.toString('base64url')}`;

process.env.PARALLAX_LICENSE_KEY =
  process.env.PARALLAX_LICENSE_KEY || testLicenseKey;
process.env.PARALLAX_LICENSE_PUBLIC_KEY =
  process.env.PARALLAX_LICENSE_PUBLIC_KEY || testPublicKeyB64;
