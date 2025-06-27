import { Logger } from 'pino';
import { getCurrentTenantId, getTenantContext } from '../tenant-context';
import { TenantQuota } from '../types';

export interface QuotaStore {
  get(tenantId: string, resource: string): Promise<TenantQuota | null>;
  increment(tenantId: string, resource: string, amount: number): Promise<TenantQuota>;
  reset(tenantId: string, resource: string): Promise<void>;
  list(tenantId: string): Promise<TenantQuota[]>;
}

export class QuotaManager {
  constructor(
    private store: QuotaStore,
    private logger: Logger
  ) {}

  /**
   * Check if quota allows the operation
   */
  async checkQuota(
    resource: string,
    amount = 1
  ): Promise<{ allowed: boolean; quota?: TenantQuota }> {
    const tenantId = getCurrentTenantId();
    const context = getTenantContext();
    
    if (!context) {
      return { allowed: false };
    }

    // Get limit from context
    const limit = (context.limits as any)[resource];
    if (typeof limit !== 'number') {
      return { allowed: true }; // No limit defined
    }

    if (limit === -1) {
      return { allowed: true }; // Unlimited
    }

    // Get current usage
    const quota = await this.store.get(tenantId, resource);
    const used = quota?.used || 0;

    const allowed = used + amount <= limit;

    if (!allowed) {
      this.logger.warn({
        tenantId,
        resource,
        used,
        limit,
        requested: amount,
      }, 'Quota exceeded');
    }

    return {
      allowed,
      quota: {
        tenantId,
        resource,
        limit,
        used,
      },
    };
  }

  /**
   * Consume quota
   */
  async consumeQuota(resource: string, amount = 1): Promise<TenantQuota> {
    const { allowed } = await this.checkQuota(resource, amount);
    
    if (!allowed) {
      throw new Error(`Quota exceeded for resource: ${resource}`);
    }

    const tenantId = getCurrentTenantId();
    const quota = await this.store.increment(tenantId, resource, amount);

    this.logger.debug({
      tenantId,
      resource,
      amount,
      newUsed: quota.used,
    }, 'Quota consumed');

    return quota;
  }

  /**
   * Get quota status
   */
  async getQuotaStatus(resource: string): Promise<TenantQuota | null> {
    const tenantId = getCurrentTenantId();
    const context = getTenantContext();
    
    if (!context) {
      return null;
    }

    const quota = await this.store.get(tenantId, resource);
    const limit = (context.limits as any)[resource] as number;

    if (!quota) {
      return {
        tenantId,
        resource,
        limit: limit || 0,
        used: 0,
      };
    }

    return {
      ...quota,
      limit: limit || quota.limit,
    };
  }

  /**
   * Get all quotas for current tenant
   */
  async getAllQuotas(): Promise<TenantQuota[]> {
    const tenantId = getCurrentTenantId();
    return this.store.list(tenantId);
  }

  /**
   * Reset quota (for periodic limits)
   */
  async resetQuota(resource: string): Promise<void> {
    const tenantId = getCurrentTenantId();
    await this.store.reset(tenantId, resource);

    this.logger.info({
      tenantId,
      resource,
    }, 'Quota reset');
  }

  /**
   * Decorator to check quota before method execution
   */
  static CheckQuota(resource: string, amount = 1) {
    return function (
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) {
      const originalMethod = descriptor.value;

      descriptor.value = async function (this: any, ...args: any[]) {
        const quotaManager = (this as any).quotaManager as QuotaManager;
        if (!quotaManager) {
          throw new Error('QuotaManager not found in class instance');
        }

        await quotaManager.consumeQuota(resource, amount);
        return originalMethod.apply(this, args);
      };

      return descriptor;
    };
  }
}

/**
 * In-memory quota store for development
 */
export class InMemoryQuotaStore implements QuotaStore {
  private quotas: Map<string, TenantQuota> = new Map();

  private getKey(tenantId: string, resource: string): string {
    return `${tenantId}:${resource}`;
  }

  async get(tenantId: string, resource: string): Promise<TenantQuota | null> {
    const key = this.getKey(tenantId, resource);
    return this.quotas.get(key) || null;
  }

  async increment(
    tenantId: string,
    resource: string,
    amount: number
  ): Promise<TenantQuota> {
    const key = this.getKey(tenantId, resource);
    const existing = this.quotas.get(key);

    const quota: TenantQuota = existing
      ? { ...existing, used: existing.used + amount }
      : {
          tenantId,
          resource,
          limit: 0, // Will be overridden by manager
          used: amount,
        };

    this.quotas.set(key, quota);
    return quota;
  }

  async reset(tenantId: string, resource: string): Promise<void> {
    const key = this.getKey(tenantId, resource);
    const existing = this.quotas.get(key);
    
    if (existing) {
      this.quotas.set(key, { ...existing, used: 0 });
    }
  }

  async list(tenantId: string): Promise<TenantQuota[]> {
    const quotas: TenantQuota[] = [];
    
    for (const [key, quota] of this.quotas.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        quotas.push(quota);
      }
    }

    return quotas;
  }
}