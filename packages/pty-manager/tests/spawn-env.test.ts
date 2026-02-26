/**
 * Tests for PTYSession.buildSpawnEnv() — environment variable construction
 * for spawned PTY processes, specifically the `inheritProcessEnv` flag.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { PTYSession } from '../src/pty-session';
import type { SpawnConfig } from '../src/types';

function makeConfig(overrides: Partial<SpawnConfig> = {}): SpawnConfig {
  return { name: 'test', type: 'test', ...overrides };
}

describe('PTYSession.buildSpawnEnv()', () => {
  afterEach(() => {
    delete process.env.__TEST_HOST_SECRET__;
    delete process.env.__TEST_INHERIT__;
  });

  it('should inherit process.env by default (no flag)', () => {
    process.env.__TEST_INHERIT__ = 'yes';
    const env = PTYSession.buildSpawnEnv(makeConfig(), {});
    expect(env.__TEST_INHERIT__).toBe('yes');
    expect(env.TERM).toBe('xterm-256color');
    expect(env.COLORTERM).toBe('truecolor');
  });

  it('should inherit process.env when inheritProcessEnv is true', () => {
    process.env.__TEST_INHERIT__ = 'present';
    const env = PTYSession.buildSpawnEnv(makeConfig({ inheritProcessEnv: true }), {});
    expect(env.__TEST_INHERIT__).toBe('present');
  });

  it('should NOT inherit process.env when inheritProcessEnv is false', () => {
    process.env.__TEST_HOST_SECRET__ = 'do-not-leak';
    const env = PTYSession.buildSpawnEnv(makeConfig({ inheritProcessEnv: false }), {});
    expect(env.__TEST_HOST_SECRET__).toBeUndefined();
  });

  it('should include config.env when inheritProcessEnv is false', () => {
    const env = PTYSession.buildSpawnEnv(
      makeConfig({ inheritProcessEnv: false, env: { PATH: '/usr/bin', HOME: '/home/user' } }),
      {},
    );
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/user');
  });

  it('should include adapter env when inheritProcessEnv is false', () => {
    const env = PTYSession.buildSpawnEnv(
      makeConfig({ inheritProcessEnv: false }),
      { ANTHROPIC_API_KEY: 'sk-test-123' },
    );
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test-123');
  });

  it('should always force TERM and COLORTERM regardless of flag', () => {
    const env = PTYSession.buildSpawnEnv(makeConfig({ inheritProcessEnv: false }), {});
    expect(env.TERM).toBe('xterm-256color');
    expect(env.COLORTERM).toBe('truecolor');
  });

  it('config.env should override adapter env', () => {
    const env = PTYSession.buildSpawnEnv(
      makeConfig({ inheritProcessEnv: false, env: { MY_VAR: 'from-config' } }),
      { MY_VAR: 'from-adapter' },
    );
    expect(env.MY_VAR).toBe('from-config');
  });

  it('should have minimal env when inheritProcessEnv is false and no config.env', () => {
    process.env.__TEST_HOST_SECRET__ = 'secret';
    const env = PTYSession.buildSpawnEnv(
      makeConfig({ inheritProcessEnv: false }),
      { ADAPTER_KEY: 'value' },
    );
    expect(env.ADAPTER_KEY).toBe('value');
    expect(env.TERM).toBe('xterm-256color');
    expect(env.COLORTERM).toBe('truecolor');
    expect(env.__TEST_HOST_SECRET__).toBeUndefined();
  });
});
