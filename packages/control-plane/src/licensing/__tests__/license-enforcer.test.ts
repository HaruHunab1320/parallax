import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { type LicensePayload, verifyLicenseKey } from '../license-keys';

// Generate a test keypair for all tests
const keypair = crypto.generateKeyPairSync('ed25519');
const publicKeyB64 = keypair.publicKey
  .export({ type: 'spki', format: 'der' })
  .toString('base64');

function signPayload(
  payload: Record<string, unknown>,
  privateKey = keypair.privateKey
): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.sign(null, Buffer.from(payloadB64), privateKey);
  return `${payloadB64}.${signature.toString('base64url')}`;
}

function makePayload(
  overrides: Partial<LicensePayload> = {}
): Record<string, unknown> {
  return {
    iss: 'parallax',
    v: 1,
    tier: 'enterprise',
    org: 'Test Corp',
    sub: 'org_test_001',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    ...overrides,
  };
}

describe('verifyLicenseKey', () => {
  describe('valid keys', () => {
    it('should verify a valid enterprise key', () => {
      const key = signPayload(makePayload({ tier: 'enterprise' }));
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.tier).toBe('enterprise');
        expect(result.payload.org).toBe('Test Corp');
      }
    });

    it('should verify a valid enterprise-plus key', () => {
      const key = signPayload(makePayload({ tier: 'enterprise-plus' }));
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.tier).toBe('enterprise-plus');
      }
    });

    it('should accept a perpetual key (exp=0)', () => {
      const key = signPayload(makePayload({ exp: 0 }));
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.exp).toBe(0);
      }
    });

    it('should accept a key with a cluster field', () => {
      const key = signPayload(makePayload({ cluster: 'prod-us-east-1' }));
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.cluster).toBe('prod-us-east-1');
      }
    });
  });

  describe('invalid signature', () => {
    it('should reject a key with a tampered payload', () => {
      const key = signPayload(makePayload());
      // Tamper with the payload portion
      const [payloadB64, sig] = key.split('.');
      const tampered = `${payloadB64.slice(0, -2)}XX`;
      const result = verifyLicenseKey(`${tampered}.${sig}`, publicKeyB64);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        // Could be "Invalid signature" or "Invalid payload encoding"
        expect(result.reason).toMatch(/Invalid signature|Invalid payload/);
      }
    });

    it('should reject a key signed by a different private key', () => {
      const otherKeypair = crypto.generateKeyPairSync('ed25519');
      const key = signPayload(makePayload(), otherKeypair.privateKey);
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('Invalid signature');
      }
    });
  });

  describe('invalid format', () => {
    it('should reject a key without a dot separator', () => {
      const result = verifyLicenseKey('no-dot-in-this-key', publicKeyB64);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('expected payload.signature');
      }
    });

    it('should reject a key with multiple dots', () => {
      const result = verifyLicenseKey('a.b.c', publicKeyB64);
      expect(result.valid).toBe(false);
    });

    it('should reject an empty payload', () => {
      const result = verifyLicenseKey('.signature', publicKeyB64);
      expect(result.valid).toBe(false);
    });

    it('should reject an empty signature', () => {
      const result = verifyLicenseKey('payload.', publicKeyB64);
      expect(result.valid).toBe(false);
    });
  });

  describe('invalid payload fields', () => {
    it('should reject wrong issuer', () => {
      const key = signPayload(makePayload({ iss: 'not-parallax' } as any));
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('Invalid issuer');
      }
    });

    it('should reject wrong schema version', () => {
      const key = signPayload(makePayload({ v: 99 } as any));
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('Unsupported schema version');
      }
    });

    it('should reject invalid tier', () => {
      const key = signPayload(makePayload({ tier: 'free' } as any));
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('Invalid tier');
      }
    });

    it('should reject missing org', () => {
      const payload = makePayload();
      delete (payload as any).org;
      const key = signPayload(payload);
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('Missing org');
      }
    });

    it('should reject missing sub', () => {
      const payload = makePayload();
      delete (payload as any).sub;
      const key = signPayload(payload);
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('Missing sub');
      }
    });
  });

  describe('invalid base64', () => {
    it('should reject non-base64 payload with valid structure', () => {
      // Create a valid signature for garbage payload
      const payloadB64 = '!!!not-base64!!!';
      const signature = crypto.sign(
        null,
        Buffer.from(payloadB64),
        keypair.privateKey
      );
      const key = `${payloadB64}.${signature.toString('base64url')}`;
      const result = verifyLicenseKey(key, publicKeyB64);
      expect(result.valid).toBe(false);
    });
  });
});

describe('LicenseEnforcer integration', () => {
  // We need to dynamically import LicenseEnforcer because it reads env vars at construction time
  const mockLogger = {
    child: () => mockLogger,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as any;

  it('should activate enterprise for a valid signed key', async () => {
    const key = signPayload(makePayload({ tier: 'enterprise' }));
    process.env.PARALLAX_LICENSE_KEY = key;
    process.env.PARALLAX_LICENSE_PUBLIC_KEY = publicKeyB64;

    // Dynamic import to pick up fresh env
    const { LicenseEnforcer } = await import('../license-enforcer');
    const enforcer = new LicenseEnforcer(mockLogger);

    expect(enforcer.isEnterprise()).toBe(true);
    expect(enforcer.getLicenseType()).toBe('enterprise');
    expect(enforcer.hasFeature('persistence')).toBe(true);
    expect(enforcer.hasFeature('unlimited_agents')).toBe(true);
  });

  it('should activate enterprise-plus for a valid signed key', async () => {
    const key = signPayload(makePayload({ tier: 'enterprise-plus' }));
    process.env.PARALLAX_LICENSE_KEY = key;
    process.env.PARALLAX_LICENSE_PUBLIC_KEY = publicKeyB64;

    const { LicenseEnforcer } = await import('../license-enforcer');
    const enforcer = new LicenseEnforcer(mockLogger);

    expect(enforcer.isEnterprisePlus()).toBe(true);
    expect(enforcer.hasFeature('multi_region')).toBe(true);
  });

  it('should fall back to opensource for legacy prefix keys', async () => {
    process.env.PARALLAX_LICENSE_KEY = 'PARALLAX-ENT-abc123';
    delete process.env.PARALLAX_LICENSE_PUBLIC_KEY;

    const { LicenseEnforcer } = await import('../license-enforcer');
    const enforcer = new LicenseEnforcer(mockLogger);

    expect(enforcer.isEnterprise()).toBe(false);
    expect(enforcer.getLicenseType()).toBe('opensource');
    expect(enforcer.hasFeature('persistence')).toBe(false);
    expect(enforcer.hasFeature('unlimited_agents')).toBe(true);
  });

  it('should reject expired signed keys', async () => {
    const expiredPayload = makePayload({
      exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    });
    const key = signPayload(expiredPayload);
    process.env.PARALLAX_LICENSE_KEY = key;
    process.env.PARALLAX_LICENSE_PUBLIC_KEY = publicKeyB64;

    const { LicenseEnforcer } = await import('../license-enforcer');
    const enforcer = new LicenseEnforcer(mockLogger);

    expect(enforcer.isEnterprise()).toBe(false);
    expect(enforcer.getLicenseType()).toBe('opensource');
  });

  it('should accept perpetual signed keys', async () => {
    const key = signPayload(makePayload({ exp: 0 }));
    process.env.PARALLAX_LICENSE_KEY = key;
    process.env.PARALLAX_LICENSE_PUBLIC_KEY = publicKeyB64;

    const { LicenseEnforcer } = await import('../license-enforcer');
    const enforcer = new LicenseEnforcer(mockLogger);

    expect(enforcer.isEnterprise()).toBe(true);
  });
});
