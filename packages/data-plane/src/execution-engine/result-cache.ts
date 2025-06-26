import { ExecutionResult, CachePolicy } from './types';
import { createHash } from 'crypto';

interface CacheEntry {
  result: ExecutionResult;
  key: string;
  expires: Date;
  accessCount: number;
  lastAccessed: Date;
}

export class ResultCache {
  private cache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = [];

  constructor(private policy: CachePolicy) {
    if (policy.enabled) {
      // Start periodic cleanup
      setInterval(() => this.cleanup(), 60 * 1000); // Every minute
    }
  }

  generateKey(taskType: string, target: string, payload: any): string {
    const data = JSON.stringify({ taskType, target, payload });
    return createHash('sha256').update(data).digest('hex');
  }

  get(key: string): ExecutionResult | null {
    if (!this.policy.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (new Date() > entry.expires) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return null;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = new Date();
    this.updateAccessOrder(key);

    return entry.result;
  }

  set(key: string, result: ExecutionResult): void {
    if (!this.policy.enabled) return;

    // Only cache high confidence results
    if (result.confidence && result.confidence < this.policy.confidenceThreshold) {
      return;
    }

    // Don't cache failures unless specifically configured
    if (result.status !== 'success') return;

    // Enforce max entries with LRU eviction
    if (this.cache.size >= this.policy.maxEntries) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      result,
      key,
      expires: new Date(Date.now() + this.policy.ttl * 1000),
      accessCount: 1,
      lastAccessed: new Date(),
    };

    this.cache.set(key, entry);
    this.accessOrder.push(key);
  }

  private cleanup(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now > entry.expires) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    // Find least recently used entry
    let lruKey = this.accessOrder[0];
    let oldestAccess = this.cache.get(lruKey)?.lastAccessed || new Date();

    for (const key of this.accessOrder) {
      const entry = this.cache.get(key);
      if (entry && entry.lastAccessed < oldestAccess) {
        lruKey = key;
        oldestAccess = entry.lastAccessed;
      }
    }

    this.cache.delete(lruKey);
    this.removeFromAccessOrder(lruKey);
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  getStats() {
    const entries = Array.from(this.cache.values());
    
    return {
      totalEntries: this.cache.size,
      totalHits: entries.reduce((sum, e) => sum + e.accessCount, 0),
      averageConfidence: entries
        .filter(e => e.result.confidence !== undefined)
        .reduce((sum, e) => sum + (e.result.confidence || 0), 0) / entries.length || 0,
      oldestEntry: entries.reduce((oldest, e) => 
        e.lastAccessed < oldest.lastAccessed ? e : oldest, 
        entries[0] || { lastAccessed: new Date() }
      ).lastAccessed,
    };
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }
}