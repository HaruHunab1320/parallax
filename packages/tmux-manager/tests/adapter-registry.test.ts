import { beforeEach, describe, expect, it } from 'vitest';
import { AdapterRegistry } from '../src/adapters/adapter-registry.js';
import { ShellAdapter } from '../src/adapters/shell-adapter.js';

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it('should register and retrieve an adapter', () => {
    const adapter = new ShellAdapter();
    registry.register(adapter);
    expect(registry.get('shell')).toBe(adapter);
  });

  it('should check if adapter exists', () => {
    expect(registry.has('shell')).toBe(false);
    registry.register(new ShellAdapter());
    expect(registry.has('shell')).toBe(true);
  });

  it('should list registered adapter types', () => {
    registry.register(new ShellAdapter());
    expect(registry.list()).toEqual(['shell']);
  });

  it('should unregister an adapter', () => {
    registry.register(new ShellAdapter());
    expect(registry.unregister('shell')).toBe(true);
    expect(registry.has('shell')).toBe(false);
  });

  it('should return all adapters', () => {
    const adapter = new ShellAdapter();
    registry.register(adapter);
    expect(registry.all()).toEqual([adapter]);
  });

  it('should clear all adapters', () => {
    registry.register(new ShellAdapter());
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
