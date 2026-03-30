import crypto from 'node:crypto';

/**
 * Ed25519 public key for license verification (base64-encoded SPKI DER).
 * Replace with the real public key from `pnpm tsx scripts/generate-license-keypair.ts`.
 */
export const LICENSE_PUBLIC_KEY_B64 =
  'MCowBQYDK2VwAyEAosfzTO5t+wf+hqAgzpAXVwYatf/PJ/9qV1Cuf/mtLg8=';

export interface LicensePayload {
  iss: string;
  v: number;
  tier: 'enterprise' | 'enterprise-plus';
  org: string;
  sub: string;
  iat: number;
  exp: number;
  cluster?: string;
}

export type VerifyResult =
  | { valid: true; payload: LicensePayload }
  | { valid: false; reason: string };

/**
 * Verify a signed license key string.
 *
 * Key format: `<payload-base64url>.<signature-base64url>`
 *
 * @param key       The license key string
 * @param publicKeyB64  Optional base64 SPKI DER public key (defaults to embedded constant)
 */
export function verifyLicenseKey(
  key: string,
  publicKeyB64?: string
): VerifyResult {
  const parts = key.split('.');
  if (parts.length !== 2) {
    return {
      valid: false,
      reason: 'Invalid license key format: expected payload.signature',
    };
  }

  const [payloadB64, signatureB64] = parts;

  if (!payloadB64 || !signatureB64) {
    return {
      valid: false,
      reason: 'Invalid license key format: empty payload or signature',
    };
  }

  // Decode and import the public key
  const pubKeyB64 = publicKeyB64 || LICENSE_PUBLIC_KEY_B64;
  if (pubKeyB64 === 'REPLACE_WITH_REAL_PUBLIC_KEY') {
    return { valid: false, reason: 'License public key not configured' };
  }

  let publicKey: crypto.KeyObject;
  try {
    const derBuffer = Buffer.from(pubKeyB64, 'base64');
    publicKey = crypto.createPublicKey({
      key: derBuffer,
      format: 'der',
      type: 'spki',
    });
  } catch {
    return { valid: false, reason: 'Invalid public key' };
  }

  // Verify the signature over the raw payload string (base64url-encoded)
  const signatureBuffer = Buffer.from(signatureB64, 'base64url');
  const isValid = crypto.verify(
    null, // Ed25519 does not use a separate hash algorithm
    Buffer.from(payloadB64),
    publicKey,
    signatureBuffer
  );

  if (!isValid) {
    return { valid: false, reason: 'Invalid signature' };
  }

  // Decode and validate the payload
  let payload: LicensePayload;
  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    payload = JSON.parse(json);
  } catch {
    return { valid: false, reason: 'Invalid payload encoding' };
  }

  if (payload.iss !== 'parallax') {
    return { valid: false, reason: `Invalid issuer: ${payload.iss}` };
  }

  if (payload.v !== 1) {
    return { valid: false, reason: `Unsupported schema version: ${payload.v}` };
  }

  if (payload.tier !== 'enterprise' && payload.tier !== 'enterprise-plus') {
    return { valid: false, reason: `Invalid tier: ${payload.tier}` };
  }

  if (typeof payload.org !== 'string' || !payload.org) {
    return { valid: false, reason: 'Missing org field' };
  }

  if (typeof payload.sub !== 'string' || !payload.sub) {
    return { valid: false, reason: 'Missing sub field' };
  }

  if (typeof payload.iat !== 'number') {
    return { valid: false, reason: 'Missing iat field' };
  }

  if (typeof payload.exp !== 'number') {
    return { valid: false, reason: 'Missing exp field' };
  }

  return { valid: true, payload };
}
