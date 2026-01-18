import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import {
  Tenant,
  TenantStatus,
  TenantPlan,
  TenantMetadata,
  TenantUsage,
  UsagePeriod,
  DEFAULT_LIMITS,
} from './types';

export interface TenantStore {
  create(tenant: Tenant): Promise<void>;
  get(id: string): Promise<Tenant | null>;
  getBySlug(slug: string): Promise<Tenant | null>;
  update(id: string, updates: Partial<Tenant>): Promise<void>;
  delete(id: string): Promise<void>;
  list(options?: ListOptions): Promise<{ tenants: Tenant[]; total: number }>;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  status?: TenantStatus;
  plan?: TenantPlan;
}

export class TenantService {
  private usageStore: Map<string, TenantUsage> = new Map();

  constructor(
    private store: TenantStore,
    private logger: Logger
  ) {}

  /**
   * Create a new tenant
   */
  async createTenant(
    name: string,
    metadata: TenantMetadata,
    plan: TenantPlan = TenantPlan.FREE
  ): Promise<Tenant> {
    const slug = this.generateSlug(name);
    
    // Check if slug already exists
    const existing = await this.store.getBySlug(slug);
    if (existing) {
      throw new Error(`Tenant with slug '${slug}' already exists`);
    }

    const tenant: Tenant = {
      id: uuidv4(),
      name,
      slug,
      status: plan === TenantPlan.FREE ? TenantStatus.TRIAL : TenantStatus.ACTIVE,
      plan,
      metadata,
      limits: DEFAULT_LIMITS[plan],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.store.create(tenant);
    
    this.logger.info({
      tenantId: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
    }, 'Tenant created');

    return tenant;
  }

  /**
   * Get tenant by ID
   */
  async getTenant(id: string): Promise<Tenant | null> {
    return this.store.get(id);
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.store.getBySlug(slug);
  }

  /**
   * Update tenant
   */
  async updateTenant(
    id: string,
    updates: Partial<Omit<Tenant, 'id' | 'createdAt'>>
  ): Promise<Tenant> {
    const tenant = await this.getTenant(id);
    if (!tenant) {
      throw new Error(`Tenant not found: ${id}`);
    }

    // Update limits if plan changed
    if (updates.plan && updates.plan !== tenant.plan) {
      updates.limits = DEFAULT_LIMITS[updates.plan];
    }

    updates.updatedAt = new Date();
    await this.store.update(id, updates);

    this.logger.info({
      tenantId: id,
      updates: Object.keys(updates),
    }, 'Tenant updated');

    return { ...tenant, ...updates } as Tenant;
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(id: string, reason: string): Promise<void> {
    await this.updateTenant(id, {
      status: TenantStatus.SUSPENDED,
      metadata: {
        suspendedAt: new Date().toISOString(),
        suspendedReason: reason,
      } as any,
    });

    this.logger.warn({
      tenantId: id,
      reason,
    }, 'Tenant suspended');
  }

  /**
   * Reactivate tenant
   */
  async reactivateTenant(id: string): Promise<void> {
    const tenant = await this.getTenant(id);
    if (!tenant) {
      throw new Error(`Tenant not found: ${id}`);
    }

    if (tenant.status !== TenantStatus.SUSPENDED) {
      throw new Error(`Tenant is not suspended: ${id}`);
    }

    await this.updateTenant(id, {
      status: TenantStatus.ACTIVE,
    });

    this.logger.info({ tenantId: id }, 'Tenant reactivated');
  }

  /**
   * Delete tenant (soft delete)
   */
  async deleteTenant(id: string): Promise<void> {
    await this.updateTenant(id, {
      status: TenantStatus.DELETED,
      metadata: {
        deletedAt: new Date().toISOString(),
      } as any,
    });

    this.logger.info({ tenantId: id }, 'Tenant deleted');
  }

  /**
   * List tenants
   */
  async listTenants(options?: ListOptions): Promise<{ tenants: Tenant[]; total: number }> {
    return this.store.list(options);
  }

  /**
   * Get tenant usage
   */
  async getTenantUsage(
    tenantId: string,
    period: UsagePeriod
  ): Promise<TenantUsage> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const usage = this.usageStore.get(tenantId) || this.createEmptyUsage(tenantId, period);
    usage.period = period;
    usage.storage.percentUsed = tenant.limits.maxStorageGB > 0
      ? (usage.storage.usedGB / tenant.limits.maxStorageGB) * 100
      : 0;

    this.usageStore.set(tenantId, usage);
    return usage;
  }

  recordUsage(
    tenantId: string,
    period: UsagePeriod,
    update: {
      agents?: { currentDelta?: number; peak?: number };
      executions?: { totalDelta?: number; successfulDelta?: number; failedDelta?: number };
      storage?: { usedGBDelta?: number };
      apiCalls?: { endpoint?: string; count?: number };
    }
  ): void {
    const usage = this.usageStore.get(tenantId) || this.createEmptyUsage(tenantId, period);
    usage.period = period;

    if (update.agents) {
      usage.agents.current += update.agents.currentDelta || 0;
      if (typeof update.agents.peak === 'number') {
        usage.agents.peak = Math.max(usage.agents.peak, update.agents.peak);
      } else {
        usage.agents.peak = Math.max(usage.agents.peak, usage.agents.current);
      }
    }

    if (update.executions) {
      usage.executions.total += update.executions.totalDelta || 0;
      usage.executions.successful += update.executions.successfulDelta || 0;
      usage.executions.failed += update.executions.failedDelta || 0;
    }

    if (update.storage) {
      usage.storage.usedGB += update.storage.usedGBDelta || 0;
    }

    if (update.apiCalls) {
      const count = update.apiCalls.count || 0;
      usage.apiCalls.total += count;
      if (update.apiCalls.endpoint) {
        const endpoint = update.apiCalls.endpoint;
        usage.apiCalls.byEndpoint[endpoint] =
          (usage.apiCalls.byEndpoint[endpoint] || 0) + count;
      }
    }

    this.usageStore.set(tenantId, usage);
  }

  /**
   * Check if tenant has feature
   */
  async hasFeature(tenantId: string, feature: keyof Tenant['limits']['features']): Promise<boolean> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      return false;
    }

    return tenant.limits.features[feature] || false;
  }

  /**
   * Check if tenant is within limits
   */
  async checkLimit(
    tenantId: string,
    resource: keyof Omit<Tenant['limits'], 'features'>,
    current: number
  ): Promise<boolean> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      return false;
    }

    const limit = tenant.limits[resource] as number;
    return limit === -1 || current < limit;
  }

  /**
   * Generate slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  private createEmptyUsage(tenantId: string, period: UsagePeriod): TenantUsage {
    return {
      tenantId,
      period,
      agents: {
        current: 0,
        peak: 0,
      },
      executions: {
        total: 0,
        successful: 0,
        failed: 0,
      },
      storage: {
        usedGB: 0,
        percentUsed: 0,
      },
      apiCalls: {
        total: 0,
        byEndpoint: {},
      },
    };
  }
}

/**
 * In-memory tenant store for development
 */
export class InMemoryTenantStore implements TenantStore {
  private tenants: Map<string, Tenant> = new Map();

  async create(tenant: Tenant): Promise<void> {
    this.tenants.set(tenant.id, tenant);
  }

  async get(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) || null;
  }

  async getBySlug(slug: string): Promise<Tenant | null> {
    for (const tenant of this.tenants.values()) {
      if (tenant.slug === slug) {
        return tenant;
      }
    }
    return null;
  }

  async update(id: string, updates: Partial<Tenant>): Promise<void> {
    const tenant = this.tenants.get(id);
    if (tenant) {
      this.tenants.set(id, { ...tenant, ...updates });
    }
  }

  async delete(id: string): Promise<void> {
    this.tenants.delete(id);
  }

  async list(options?: ListOptions): Promise<{ tenants: Tenant[]; total: number }> {
    let tenants = Array.from(this.tenants.values());

    if (options?.status) {
      tenants = tenants.filter(t => t.status === options.status);
    }

    if (options?.plan) {
      tenants = tenants.filter(t => t.plan === options.plan);
    }

    const total = tenants.length;

    if (options?.offset) {
      tenants = tenants.slice(options.offset);
    }

    if (options?.limit) {
      tenants = tenants.slice(0, options.limit);
    }

    return { tenants, total };
  }
}
