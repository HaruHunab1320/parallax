/**
 * Distributed Lock Service
 *
 * Provides distributed locking using Redis to prevent race conditions
 * across multiple control plane instances.
 */

import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';

export interface DistributedLockConfig {
  /** Redis connection URL */
  redisUrl: string;
  /** Key prefix for locks */
  keyPrefix?: string;
  /** Default lock TTL in milliseconds */
  defaultTTL?: number;
  /** Retry delay when acquiring lock */
  retryDelay?: number;
  /** Maximum retries when acquiring lock */
  maxRetries?: number;
}

export interface LockOptions {
  /** Lock TTL in milliseconds */
  ttl?: number;
  /** Wait for lock to be available */
  wait?: boolean;
  /** Maximum time to wait for lock in milliseconds */
  waitTimeout?: number;
}

export interface Lock {
  key: string;
  token: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export class DistributedLockService {
  private redis: Redis;
  private logger: Logger;
  private keyPrefix: string;
  private defaultTTL: number;
  private retryDelay: number;
  private maxRetries: number;
  private activeLocks: Map<string, Lock> = new Map();
  private renewalIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: DistributedLockConfig, logger: Logger) {
    this.redis = new Redis(config.redisUrl);
    this.keyPrefix = config.keyPrefix || 'parallax:lock:';
    this.defaultTTL = config.defaultTTL || 30000; // 30 seconds
    this.retryDelay = config.retryDelay || 100;
    this.maxRetries = config.maxRetries || 100;
    this.logger = logger.child({ component: 'DistributedLock' });

    this.redis.on('error', (error) => {
      this.logger.error({ error }, 'Redis connection error');
    });
  }

  /**
   * Acquire a distributed lock
   */
  async acquire(resource: string, options: LockOptions = {}): Promise<Lock | null> {
    const ttl = options.ttl || this.defaultTTL;
    const key = this.keyPrefix + resource;
    const token = uuidv4();

    const tryAcquire = async (): Promise<boolean> => {
      // SET key token NX PX ttl
      const result = await this.redis.set(key, token, 'PX', ttl, 'NX');
      return result === 'OK';
    };

    // Try to acquire immediately
    if (await tryAcquire()) {
      const lock = this.createLock(key, token, ttl);
      this.startRenewal(lock);
      return lock;
    }

    // If not waiting, return null
    if (!options.wait) {
      this.logger.debug({ resource }, 'Lock not available');
      return null;
    }

    // Wait for lock with retries
    const waitTimeout = options.waitTimeout || this.defaultTTL * 2;
    const startTime = Date.now();
    let retries = 0;

    while (Date.now() - startTime < waitTimeout && retries < this.maxRetries) {
      await this.sleep(this.retryDelay);
      retries++;

      if (await tryAcquire()) {
        const lock = this.createLock(key, token, ttl);
        this.startRenewal(lock);
        this.logger.debug({ resource, retries }, 'Lock acquired after waiting');
        return lock;
      }
    }

    this.logger.debug({ resource, retries, elapsed: Date.now() - startTime }, 'Failed to acquire lock after waiting');
    return null;
  }

  /**
   * Release a distributed lock
   */
  async release(lock: Lock): Promise<boolean> {
    // Use Lua script to ensure we only release our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(script, 1, lock.key, lock.token);
      const released = result === 1;

      if (released) {
        this.stopRenewal(lock.key);
        this.activeLocks.delete(lock.key);
        this.logger.debug({ resource: lock.key }, 'Lock released');
      } else {
        this.logger.warn({ resource: lock.key }, 'Lock was not released (already expired or not owned)');
      }

      return released;
    } catch (error) {
      this.logger.error({ error, resource: lock.key }, 'Failed to release lock');
      return false;
    }
  }

  /**
   * Extend a lock's TTL
   */
  async extend(lock: Lock, additionalTTL?: number): Promise<boolean> {
    const ttl = additionalTTL || this.defaultTTL;

    // Use Lua script to extend only our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(script, 1, lock.key, lock.token, ttl);
      const extended = result === 1;

      if (extended) {
        lock.expiresAt = new Date(Date.now() + ttl);
        this.logger.debug({ resource: lock.key, ttl }, 'Lock extended');
      }

      return extended;
    } catch (error) {
      this.logger.error({ error, resource: lock.key }, 'Failed to extend lock');
      return false;
    }
  }

  /**
   * Check if a lock is held (by anyone)
   */
  async isLocked(resource: string): Promise<boolean> {
    const key = this.keyPrefix + resource;
    const value = await this.redis.get(key);
    return value !== null;
  }

  /**
   * Execute a function while holding a lock.
   * Automatically acquires and releases the lock.
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const lock = await this.acquire(resource, { ...options, wait: true });

    if (!lock) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(lock);
    }
  }

  /**
   * Try to execute a function while holding a lock.
   * Returns null if lock cannot be acquired.
   */
  async tryWithLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T | null> {
    const lock = await this.acquire(resource, { ...options, wait: false });

    if (!lock) {
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.release(lock);
    }
  }

  /**
   * Release all locks held by this instance
   */
  async releaseAll(): Promise<void> {
    const locks = Array.from(this.activeLocks.values());
    await Promise.all(locks.map((lock) => this.release(lock)));
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    await this.releaseAll();

    // Clear all renewal intervals
    for (const interval of this.renewalIntervals.values()) {
      clearInterval(interval);
    }
    this.renewalIntervals.clear();

    this.redis.disconnect();
  }

  private createLock(key: string, token: string, ttl: number): Lock {
    const lock: Lock = {
      key,
      token,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + ttl),
    };
    this.activeLocks.set(key, lock);
    return lock;
  }

  private startRenewal(lock: Lock): void {
    // Renew at 50% of TTL
    const renewalInterval = this.defaultTTL / 2;

    const interval = setInterval(async () => {
      if (!this.activeLocks.has(lock.key)) {
        clearInterval(interval);
        return;
      }

      const extended = await this.extend(lock);
      if (!extended) {
        // Lock was lost
        this.stopRenewal(lock.key);
        this.activeLocks.delete(lock.key);
        this.logger.warn({ resource: lock.key }, 'Lock lost during renewal');
      }
    }, renewalInterval);

    this.renewalIntervals.set(lock.key, interval);
  }

  private stopRenewal(key: string): void {
    const interval = this.renewalIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.renewalIntervals.delete(key);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Commonly used lock resources
 */
export const LockResources = {
  /** Lock for scheduled pattern execution */
  SCHEDULER_RUN: 'scheduler:run',
  /** Lock for a specific pattern execution */
  patternExecution: (patternId: string) => `execution:pattern:${patternId}`,
  /** Lock for agent assignment */
  agentAssignment: (agentId: string) => `agent:assign:${agentId}`,
  /** Lock for configuration updates */
  CONFIG_UPDATE: 'config:update',
  /** Lock for cleanup/GC tasks */
  CLEANUP: 'cleanup',
  /** Lock for metrics aggregation */
  METRICS_AGGREGATE: 'metrics:aggregate',
} as const;

/**
 * Create a distributed lock service
 */
export function createDistributedLock(
  redisUrl: string,
  logger: Logger,
  options?: Partial<DistributedLockConfig>
): DistributedLockService {
  return new DistributedLockService(
    {
      redisUrl,
      ...options,
    },
    logger
  );
}
