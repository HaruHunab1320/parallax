import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('LicenseResource', () => {
  let client: ParallaxClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new ParallaxClient({ baseUrl: 'http://localhost:8081' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(body: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    });
  }

  it('should get license info', async () => {
    mockFetch({
      type: 'enterprise',
      features: ['pattern_management', 'scheduled_patterns'],
    });

    const result = await client.license.info();

    expect(result.type).toBe('enterprise');
    expect(result.features).toContain('pattern_management');
  });

  it('should get license features', async () => {
    mockFetch({
      type: 'enterprise',
      features: ['pattern_management'],
      isEnterprise: true,
      isEnterprisePlus: false,
    });

    const result = await client.license.features();

    expect(result.isEnterprise).toBe(true);
    expect(result.isEnterprisePlus).toBe(false);
  });

  it('should check a feature', async () => {
    mockFetch({
      feature: 'scheduled_patterns',
      available: true,
      licenseType: 'enterprise',
      upgradeUrl: null,
    });

    const result = await client.license.check('scheduled_patterns');

    expect(result.available).toBe(true);
    expect(result.upgradeUrl).toBeNull();
  });

  it('should check unavailable feature', async () => {
    mockFetch({
      feature: 'multi_user',
      available: false,
      licenseType: 'open_source',
      upgradeUrl: 'https://parallax.ai/enterprise',
    });

    const result = await client.license.check('multi_user');

    expect(result.available).toBe(false);
    expect(result.upgradeUrl).toBe('https://parallax.ai/enterprise');
  });
});
