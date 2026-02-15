import { describe, it, expect, beforeEach } from 'vitest';
import { AdapterRegistry } from './adapter-registry';
import type { CLIAdapter } from './adapter-interface';
import type { SpawnConfig, ParsedOutput, LoginDetection } from '../types';

// Mock adapter for testing
function createMockAdapter(type: string): CLIAdapter {
  return {
    adapterType: type,
    displayName: `Mock ${type}`,
    autoResponseRules: [],
    getCommand: () => type,
    getArgs: (_config: SpawnConfig) => [],
    getEnv: (_config: SpawnConfig) => ({}),
    detectLogin: (_output: string): LoginDetection => ({ required: false }),
    detectReady: (_output: string) => true,
    detectExit: (_output: string) => ({ exited: false }),
    parseOutput: (_output: string): ParsedOutput | null => null,
    formatInput: (message: string) => message,
    getPromptPattern: () => /\$/,
  };
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it('should start empty', () => {
    expect(registry.list()).toHaveLength(0);
    expect(registry.all()).toHaveLength(0);
  });

  it('should register an adapter', () => {
    const adapter = createMockAdapter('test');
    registry.register(adapter);

    expect(registry.has('test')).toBe(true);
    expect(registry.get('test')).toBe(adapter);
    expect(registry.list()).toContain('test');
  });

  it('should register multiple adapters', () => {
    registry.register(createMockAdapter('a'));
    registry.register(createMockAdapter('b'));
    registry.register(createMockAdapter('c'));

    expect(registry.list()).toHaveLength(3);
    expect(registry.list()).toContain('a');
    expect(registry.list()).toContain('b');
    expect(registry.list()).toContain('c');
  });

  it('should return undefined for unknown adapter', () => {
    expect(registry.get('unknown')).toBeUndefined();
    expect(registry.has('unknown')).toBe(false);
  });

  it('should unregister an adapter', () => {
    registry.register(createMockAdapter('test'));
    expect(registry.has('test')).toBe(true);

    const result = registry.unregister('test');
    expect(result).toBe(true);
    expect(registry.has('test')).toBe(false);
  });

  it('should return false when unregistering non-existent adapter', () => {
    const result = registry.unregister('nonexistent');
    expect(result).toBe(false);
  });

  it('should clear all adapters', () => {
    registry.register(createMockAdapter('a'));
    registry.register(createMockAdapter('b'));
    expect(registry.list()).toHaveLength(2);

    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });

  it('should return all adapters', () => {
    const a = createMockAdapter('a');
    const b = createMockAdapter('b');
    registry.register(a);
    registry.register(b);

    const all = registry.all();
    expect(all).toHaveLength(2);
    expect(all).toContain(a);
    expect(all).toContain(b);
  });

  it('should overwrite adapter with same type', () => {
    const first = createMockAdapter('test');
    const second = createMockAdapter('test');

    registry.register(first);
    registry.register(second);

    expect(registry.list()).toHaveLength(1);
    expect(registry.get('test')).toBe(second);
  });
});
