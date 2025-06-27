import { Logger } from 'pino';
import { getCurrentTenantId, getTenantContext } from '../tenant-context';
import { ResourceType, TenantResource } from '../types';

export interface ResourceStore {
  create(resource: TenantResource): Promise<void>;
  get(id: string): Promise<TenantResource | null>;
  list(tenantId: string, resourceType?: ResourceType): Promise<TenantResource[]>;
  delete(id: string): Promise<void>;
  exists(tenantId: string, resourceType: ResourceType, resourceId: string): Promise<boolean>;
}

/**
 * Service for isolating resources by tenant
 */
export class ResourceIsolator {
  constructor(
    private store: ResourceStore,
    private logger: Logger
  ) {}

  /**
   * Create a tenant-scoped resource
   */
  async createResource(
    resourceType: ResourceType,
    resourceId: string,
    createdBy?: string
  ): Promise<TenantResource> {
    const tenantId = getCurrentTenantId();

    const resource: TenantResource = {
      id: `${tenantId}:${resourceType}:${resourceId}`,
      tenantId,
      resourceType,
      resourceId,
      createdAt: new Date(),
      createdBy: createdBy || getTenantContext()?.userId || 'system',
    };

    await this.store.create(resource);

    this.logger.debug({
      tenantId,
      resourceType,
      resourceId,
    }, 'Resource created');

    return resource;
  }

  /**
   * Check if a resource belongs to the current tenant
   */
  async validateResourceAccess(
    resourceType: ResourceType,
    resourceId: string
  ): Promise<boolean> {
    const tenantId = getCurrentTenantId();
    return this.store.exists(tenantId, resourceType, resourceId);
  }

  /**
   * Get resources for current tenant
   */
  async listResources(resourceType?: ResourceType): Promise<TenantResource[]> {
    const tenantId = getCurrentTenantId();
    return this.store.list(tenantId, resourceType);
  }

  /**
   * Delete a resource (with access check)
   */
  async deleteResource(
    resourceType: ResourceType,
    resourceId: string
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    
    const hasAccess = await this.validateResourceAccess(resourceType, resourceId);
    if (!hasAccess) {
      throw new Error(`Access denied to resource: ${resourceType}:${resourceId}`);
    }

    const id = `${tenantId}:${resourceType}:${resourceId}`;
    await this.store.delete(id);

    this.logger.debug({
      tenantId,
      resourceType,
      resourceId,
    }, 'Resource deleted');
  }

  /**
   * Wrap a query to filter by tenant
   */
  filterByTenant<T extends { tenantId?: string }>(
    items: T[]
  ): T[] {
    const tenantId = getCurrentTenantId();
    return items.filter(item => item.tenantId === tenantId);
  }

  /**
   * Add tenant ID to an object
   */
  addTenantId<T extends object>(obj: T): T & { tenantId: string } {
    const tenantId = getCurrentTenantId();
    return { ...obj, tenantId };
  }

  /**
   * Create a tenant-scoped ID
   */
  createScopedId(prefix: string): string {
    const tenantId = getCurrentTenantId();
    const randomId = Math.random().toString(36).substring(2, 15);
    return `${tenantId}_${prefix}_${randomId}`;
  }
}

/**
 * In-memory resource store for development
 */
export class InMemoryResourceStore implements ResourceStore {
  private resources: Map<string, TenantResource> = new Map();

  async create(resource: TenantResource): Promise<void> {
    this.resources.set(resource.id, resource);
  }

  async get(id: string): Promise<TenantResource | null> {
    return this.resources.get(id) || null;
  }

  async list(tenantId: string, resourceType?: ResourceType): Promise<TenantResource[]> {
    const resources = Array.from(this.resources.values())
      .filter(r => r.tenantId === tenantId);

    if (resourceType) {
      return resources.filter(r => r.resourceType === resourceType);
    }

    return resources;
  }

  async delete(id: string): Promise<void> {
    this.resources.delete(id);
  }

  async exists(
    tenantId: string,
    resourceType: ResourceType,
    resourceId: string
  ): Promise<boolean> {
    const id = `${tenantId}:${resourceType}:${resourceId}`;
    return this.resources.has(id);
  }
}