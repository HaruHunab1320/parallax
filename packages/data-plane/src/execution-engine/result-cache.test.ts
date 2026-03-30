import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultCache } from './result-cache';
import type { CachePolicy, ExecutionResult } from './types';

function makeResult(
  taskId: string,
  overrides: Partial<ExecutionResult> = {}
): ExecutionResult {
  return {
    taskId,
    status: 'success',
    result: { data: taskId },
    confidence: 0.9,
    executionTime: 100,
    retries: 0,
    ...overrides,
  };
}

const enabledPolicy: CachePolicy = {
  enabled: true,
  ttl: 300,
  confidenceThreshold: 0.7,
  maxEntries: 10,
};

const disabledPolicy: CachePolicy = {
  enabled: false,
  ttl: 300,
  confidenceThreshold: 0.7,
  maxEntries: 10,
};

describe('ResultCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateKey', () => {
    it('should generate consistent SHA256 keys', () => {
      const cache = new ResultCache(enabledPolicy);
      const key1 = cache.generateKey('agent', 'target-1', { data: true });
      const key2 = cache.generateKey('agent', 'target-1', { data: true });
      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA256 hex
    });

    it('should generate different keys for different inputs', () => {
      const cache = new ResultCache(enabledPolicy);
      const key1 = cache.generateKey('agent', 'target-1', { data: true });
      const key2 = cache.generateKey('agent', 'target-2', { data: true });
      expect(key1).not.toBe(key2);
    });
  });

  describe('get/set', () => {
    it('should store and retrieve a result', () => {
      const cache = new ResultCache(enabledPolicy);
      const result = makeResult('t1');
      const key = cache.generateKey('agent', 'a1', {});
      cache.set(key, result);
      expect(cache.get(key)).toEqual(result);
    });

    it('should return null for cache miss', () => {
      const cache = new ResultCache(enabledPolicy);
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should not cache when disabled', () => {
      const cache = new ResultCache(disabledPolicy);
      const result = makeResult('t1');
      const key = 'test-key';
      cache.set(key, result);
      expect(cache.get(key)).toBeNull();
    });

    it('should not cache low-confidence results', () => {
      const cache = new ResultCache(enabledPolicy);
      const result = makeResult('t1', { confidence: 0.3 });
      const key = 'test-key';
      cache.set(key, result);
      expect(cache.get(key)).toBeNull();
    });

    it('should not cache failures', () => {
      const cache = new ResultCache(enabledPolicy);
      const result = makeResult('t1', { status: 'failure' });
      const key = 'test-key';
      cache.set(key, result);
      expect(cache.get(key)).toBeNull();
    });

    it('should expire entries after TTL', () => {
      const cache = new ResultCache({ ...enabledPolicy, ttl: 60 });
      const result = makeResult('t1');
      const key = 'test-key';
      cache.set(key, result);
      expect(cache.get(key)).toEqual(result);

      // Advance past TTL
      vi.advanceTimersByTime(61 * 1000);
      expect(cache.get(key)).toBeNull();
    });

    it('should evict LRU entries when max reached', () => {
      const cache = new ResultCache({ ...enabledPolicy, maxEntries: 2 });
      cache.set('k1', makeResult('t1'));
      cache.set('k2', makeResult('t2'));
      // Access k1 to make k2 least recently used
      cache.get('k1');
      // Add a third entry — should evict k2
      cache.set('k3', makeResult('t3'));
      expect(cache.get('k1')).not.toBeNull();
      expect(cache.get('k2')).toBeNull();
      expect(cache.get('k3')).not.toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const cache = new ResultCache(enabledPolicy);
      cache.set('k1', makeResult('t1', { confidence: 0.9 }));
      cache.set('k2', makeResult('t2', { confidence: 0.8 }));
      cache.get('k1');
      cache.get('k1');

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.totalHits).toBeGreaterThan(2); // Initial sets + gets
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new ResultCache(enabledPolicy);
      cache.set('k1', makeResult('t1'));
      cache.set('k2', makeResult('t2'));
      cache.clear();
      expect(cache.get('k1')).toBeNull();
      expect(cache.get('k2')).toBeNull();
      expect(cache.getStats().totalEntries).toBe(0);
    });
  });
});
