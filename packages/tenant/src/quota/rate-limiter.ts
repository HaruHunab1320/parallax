import { Logger } from 'pino';
import { getCurrentTenantId } from '../tenant-context';
import { RateLimitConfig } from '../types';

export interface RateLimitStore {
  increment(key: string, window: number): Promise<{ count: number; ttl: number }>;
  get(key: string): Promise<number>;
  reset(key: string): Promise<void>;
}

export class RateLimiter {
  constructor(
    private store: RateLimitStore,
    private logger: Logger
  ) {}

  /**
   * Check rate limit
   */
  async checkLimit(config: RateLimitConfig): Promise<{
    allowed: boolean;
    count: number;
    limit: number;
    resetIn: number;
  }> {
    const tenantId = getCurrentTenantId();
    const key = this.getKey(tenantId, config);

    const { count, ttl } = await this.store.increment(key, config.window);
    const allowed = count <= config.limit;

    if (!allowed) {
      this.logger.warn({
        tenantId,
        resource: config.resource,
        count,
        limit: config.limit,
      }, 'Rate limit exceeded');
    }

    return {
      allowed,
      count,
      limit: config.limit,
      resetIn: ttl,
    };
  }

  /**
   * Express middleware for rate limiting
   */
  middleware(config: RateLimitConfig) {
    return async (req: any, res: any, next: any) => {
      try {
        const result = await this.checkLimit(config);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', result.limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, result.limit - result.count));
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + result.resetIn * 1000).toISOString());

        if (!result.allowed) {
          res.setHeader('Retry-After', result.resetIn);
          return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded for ${config.resource}`,
            retryAfter: result.resetIn,
          });
        }

        next();
      } catch (error) {
        this.logger.error({ error }, 'Rate limiter error');
        next(); // Fail open
      }
    };
  }

  /**
   * Get current count for a resource
   */
  async getCount(resource: string): Promise<number> {
    const tenantId = getCurrentTenantId();
    const key = `${tenantId}:${resource}`;
    return this.store.get(key);
  }

  /**
   * Reset rate limit for a resource
   */
  async reset(resource: string): Promise<void> {
    const tenantId = getCurrentTenantId();
    const key = `${tenantId}:${resource}`;
    await this.store.reset(key);
  }

  /**
   * Generate rate limit key
   */
  private getKey(tenantId: string, config: RateLimitConfig): string {
    const prefix = config.keyPrefix || '';
    return `${prefix}${tenantId}:${config.resource}`;
  }
}

/**
 * In-memory rate limit store for development
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private counts: Map<string, { count: number; expiresAt: number }> = new Map();

  async increment(key: string, window: number): Promise<{ count: number; ttl: number }> {
    const now = Date.now();
    const existing = this.counts.get(key);

    if (existing && existing.expiresAt > now) {
      // Increment existing counter
      existing.count++;
      const ttl = Math.ceil((existing.expiresAt - now) / 1000);
      return { count: existing.count, ttl };
    } else {
      // Create new counter
      const expiresAt = now + window * 1000;
      this.counts.set(key, { count: 1, expiresAt });
      return { count: 1, ttl: window };
    }
  }

  async get(key: string): Promise<number> {
    const now = Date.now();
    const existing = this.counts.get(key);

    if (existing && existing.expiresAt > now) {
      return existing.count;
    }

    return 0;
  }

  async reset(key: string): Promise<void> {
    this.counts.delete(key);
  }

  // Cleanup expired entries periodically
  startCleanup(intervalMs = 60000): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.counts.entries()) {
        if (value.expiresAt <= now) {
          this.counts.delete(key);
        }
      }
    }, intervalMs);
  }
}

/**
 * Common rate limit configurations
 */
export const RateLimitConfigs = {
  API_REQUESTS: {
    resource: 'api_requests',
    limit: 1000,
    window: 3600, // 1 hour
  },
  PATTERN_EXECUTIONS: {
    resource: 'pattern_executions',
    limit: 100,
    window: 60, // 1 minute
  },
  AGENT_REGISTRATIONS: {
    resource: 'agent_registrations',
    limit: 10,
    window: 3600, // 1 hour
  },
  AUTH_ATTEMPTS: {
    resource: 'auth_attempts',
    limit: 5,
    window: 900, // 15 minutes
  },
} as const;