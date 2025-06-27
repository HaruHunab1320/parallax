import { getCurrentTenantId } from '../tenant-context';

/**
 * Base class for tenant-isolated data repositories
 */
export abstract class TenantIsolatedRepository<T> {
  protected abstract tableName: string;

  /**
   * Add tenant filter to query conditions
   */
  protected addTenantFilter(conditions: any = {}): any {
    const tenantId = getCurrentTenantId();
    return {
      ...conditions,
      tenantId,
    };
  }

  /**
   * Add tenant ID to data
   */
  protected addTenantId<D extends object>(data: D): D & { tenantId: string } {
    const tenantId = getCurrentTenantId();
    return {
      ...data,
      tenantId,
    };
  }

  /**
   * Validate tenant access
   */
  protected validateTenantAccess(item: any): void {
    const tenantId = getCurrentTenantId();
    if (item.tenantId !== tenantId) {
      throw new Error('Access denied: resource belongs to different tenant');
    }
  }

  /**
   * Generate SQL WHERE clause for tenant isolation
   */
  protected getTenantWhereClause(): string {
    const tenantId = getCurrentTenantId();
    return `tenant_id = '${tenantId}'`;
  }

  /**
   * Get tenant-scoped table name (for separate schemas)
   */
  protected getTenantTableName(): string {
    const tenantId = getCurrentTenantId();
    return `tenant_${tenantId}.${this.tableName}`;
  }
}

/**
 * Example implementation for a Pattern repository
 */
export class TenantPatternRepository extends TenantIsolatedRepository<any> {
  protected tableName = 'patterns';

  async create(pattern: any): Promise<any> {
    // Add tenant ID
    const data = this.addTenantId(pattern);
    
    // In real implementation, insert into database
    console.log(`INSERT INTO ${this.tableName}`, data);
    
    return data;
  }

  async findById(id: string): Promise<any | null> {
    // In real implementation, query database with tenant filter
    const query = `SELECT * FROM ${this.tableName} WHERE id = ? AND ${this.getTenantWhereClause()}`;
    console.log(query, [id]);
    
    // Mock result
    const result = { id, tenantId: getCurrentTenantId(), name: 'test' };
    
    // Validate access
    this.validateTenantAccess(result);
    
    return result;
  }

  async findAll(limit = 100): Promise<any[]> {
    // In real implementation, query database with tenant filter
    const query = `SELECT * FROM ${this.tableName} WHERE ${this.getTenantWhereClause()} LIMIT ?`;
    console.log(query, [limit]);
    
    return [];
  }

  async update(id: string, updates: any): Promise<void> {
    // First, verify the resource belongs to the tenant
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Resource not found');
    }
    
    // In real implementation, update in database
    const query = `UPDATE ${this.tableName} SET ? WHERE id = ? AND ${this.getTenantWhereClause()}`;
    console.log(query, [updates, id]);
  }

  async delete(id: string): Promise<void> {
    // First, verify the resource belongs to the tenant
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Resource not found');
    }
    
    // In real implementation, delete from database
    const query = `DELETE FROM ${this.tableName} WHERE id = ? AND ${this.getTenantWhereClause()}`;
    console.log(query, [id]);
  }
}

/**
 * Query builder helper for tenant isolation
 */
export class TenantQueryBuilder {
  private conditions: string[] = [];
  private params: any[] = [];

  constructor(private tableName: string) {
    // Always add tenant filter
    this.where('tenant_id', getCurrentTenantId());
  }

  where(column: string, value: any): this {
    this.conditions.push(`${column} = ?`);
    this.params.push(value);
    return this;
  }

  whereIn(column: string, values: any[]): this {
    const placeholders = values.map(() => '?').join(', ');
    this.conditions.push(`${column} IN (${placeholders})`);
    this.params.push(...values);
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.conditions.push(`ORDER BY ${column} ${direction}`);
    return this;
  }

  limit(count: number): this {
    this.conditions.push(`LIMIT ?`);
    this.params.push(count);
    return this;
  }

  build(): { query: string; params: any[] } {
    const query = `SELECT * FROM ${this.tableName} WHERE ${this.conditions.join(' AND ')}`;
    return { query, params: this.params };
  }
}