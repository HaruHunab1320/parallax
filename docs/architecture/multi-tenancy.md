# Multi-Tenancy Architecture

This document describes the multi-tenancy implementation in the Parallax platform.

## Overview

Parallax supports full multi-tenancy with:
- **Tenant Isolation**: Complete data and resource isolation
- **Flexible Plans**: Free, Starter, Professional, and Enterprise tiers
- **Resource Quotas**: Configurable limits per tenant
- **Rate Limiting**: Prevent abuse and ensure fair usage
- **Feature Flags**: Enable/disable features by plan

## Architecture

### Tenant Context

Every request operates within a tenant context using Node.js AsyncLocalStorage:

```typescript
import { getTenantContext, runWithTenantContext } from '@parallax/tenant';

// Get current tenant
const context = getTenantContext();
console.log('Current tenant:', context.tenantId);

// Run with specific tenant
await runWithTenantContext(tenantContext, async () => {
  // All operations here are scoped to the tenant
});
```

### Tenant Resolution

Tenants are resolved from requests in priority order:
1. HTTP Header (`X-Tenant-ID`)
2. URL Parameter (`/api/tenants/:tenantId/...`)
3. Query Parameter (`?tenant=...`)
4. Default tenant (if configured)

## Implementation

### 1. Tenant Service

```typescript
import { TenantService, InMemoryTenantStore } from '@parallax/tenant';

const tenantService = new TenantService(
  new InMemoryTenantStore(), // Use PostgreSQL in production
  logger
);

// Create tenant
const tenant = await tenantService.createTenant(
  'Acme Corp',
  {
    contactEmail: 'admin@acme.com',
    contactName: 'John Doe',
    company: 'Acme Corporation',
  },
  TenantPlan.PROFESSIONAL
);

// Get tenant
const tenant = await tenantService.getTenant(tenantId);

// Update plan
await tenantService.updateTenant(tenantId, {
  plan: TenantPlan.ENTERPRISE,
});
```

### 2. Tenant Middleware

```typescript
import { TenantMiddleware } from '@parallax/tenant';

const tenantMiddleware = new TenantMiddleware(tenantService, logger);

// Apply to all routes
app.use(tenantMiddleware.resolve({
  requireTenant: true,
  headerName: 'x-tenant-id',
}));

// Check resource limits
app.post('/api/agents',
  tenantMiddleware.checkLimit('maxAgents', async (req) => {
    // Get current agent count
    return agentService.countByTenant(req.tenant.tenantId);
  }),
  async (req, res) => {
    // Create agent
  }
);

// Require feature
app.post('/api/patterns/custom',
  tenantMiddleware.requireFeature('customPatterns'),
  async (req, res) => {
    // Create custom pattern
  }
);
```

### 3. Resource Isolation

```typescript
import { ResourceIsolator, ResourceType } from '@parallax/tenant';

const isolator = new ResourceIsolator(store, logger);

// Create tenant-scoped resource
await isolator.createResource(
  ResourceType.AGENT,
  agentId,
  userId
);

// Validate access
const hasAccess = await isolator.validateResourceAccess(
  ResourceType.AGENT,
  agentId
);

// List tenant resources
const agents = await isolator.listResources(ResourceType.AGENT);
```

### 4. Data Isolation

```typescript
import { TenantIsolatedRepository } from '@parallax/tenant';

class AgentRepository extends TenantIsolatedRepository<Agent> {
  protected tableName = 'agents';

  async create(agent: Agent): Promise<Agent> {
    // Automatically adds tenantId
    const data = this.addTenantId(agent);
    return db.insert(this.tableName, data);
  }

  async findAll(): Promise<Agent[]> {
    // Automatically filters by tenant
    const conditions = this.addTenantFilter();
    return db.select(this.tableName, conditions);
  }
}
```

### 5. Quota Management

```typescript
import { QuotaManager } from '@parallax/tenant';

const quotaManager = new QuotaManager(store, logger);

// Check quota
const { allowed, quota } = await quotaManager.checkQuota('maxExecutions');

// Consume quota
await quotaManager.consumeQuota('maxExecutions', 1);

// Using decorator
class PatternService {
  constructor(private quotaManager: QuotaManager) {}

  @QuotaManager.CheckQuota('maxExecutions')
  async executePattern(pattern: string, input: any) {
    // Quota automatically checked and consumed
  }
}
```

### 6. Rate Limiting

```typescript
import { RateLimiter, RateLimitConfigs } from '@parallax/tenant';

const rateLimiter = new RateLimiter(store, logger);

// Apply rate limit middleware
app.use('/api',
  rateLimiter.middleware(RateLimitConfigs.API_REQUESTS)
);

// Custom rate limit
app.post('/api/patterns/:id/execute',
  rateLimiter.middleware({
    resource: 'pattern_execution',
    limit: 60,
    window: 60, // 60 requests per minute
  }),
  async (req, res) => {
    // Execute pattern
  }
);
```

## Tenant Plans

### Free Tier
- 3 agents max
- 1,000 executions/month
- 10 executions/minute
- 1GB storage
- 7-day retention
- Basic features only

### Starter ($99/month)
- 10 agents
- 10,000 executions/month
- 50 executions/minute
- 10GB storage
- 30-day retention
- Custom patterns
- Audit logs
- Data export

### Professional ($499/month)
- 50 agents
- 100,000 executions/month
- 200 executions/minute
- 100GB storage
- 90-day retention
- All Starter features plus:
- Advanced analytics
- SSO support
- Priority support

### Enterprise (Custom)
- Unlimited agents
- Unlimited executions
- Unlimited storage
- 365-day retention
- All features
- Dedicated support
- Custom integrations
- SLA guarantees

## Database Schema

### Tenant Table

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL,
  plan VARCHAR(20) NOT NULL,
  metadata JSONB,
  limits JSONB,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
```

### Resource Isolation

```sql
-- Add tenant_id to all tables
ALTER TABLE agents ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE patterns ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE executions ADD COLUMN tenant_id UUID NOT NULL;

-- Create indexes
CREATE INDEX idx_agents_tenant ON agents(tenant_id);
CREATE INDEX idx_patterns_tenant ON patterns(tenant_id);
CREATE INDEX idx_executions_tenant ON executions(tenant_id);

-- Row-level security
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON agents
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

## Security Considerations

### 1. Tenant Isolation

- All queries must include tenant filter
- Use row-level security in database
- Validate tenant access on every operation
- Separate schemas or databases for high-security tenants

### 2. Cross-Tenant Access

- Admin users can access all tenants
- Explicit permission required for cross-tenant access
- Audit all cross-tenant operations
- Use separate admin endpoints

### 3. Data Leakage Prevention

- Never expose internal IDs
- Use tenant-scoped IDs
- Validate all user inputs
- Sanitize error messages

## Monitoring

### Metrics to Track

```typescript
// Per-tenant metrics
- Active agents
- Execution count
- API requests
- Storage usage
- Error rates

// System metrics
- Total tenants
- Active tenants
- Resource utilization
- Revenue by plan
```

### Alerts

```yaml
- Quota exceeded
- Rate limit violations
- Suspicious activity
- Plan limit approaching
- Failed tenant operations
```

## Migration Guide

### 1. Enable Multi-Tenancy

```typescript
// 1. Configure tenant middleware
app.use(tenantMiddleware.resolve());

// 2. Update repositories
class AgentRepository extends TenantIsolatedRepository<Agent> {
  // Implementation
}

// 3. Add tenant context to workers
await runWithTenantContext(context, async () => {
  await processJob(job);
});
```

### 2. Migrate Existing Data

```sql
-- Add tenant column
ALTER TABLE agents ADD COLUMN tenant_id UUID;

-- Create default tenant
INSERT INTO tenants (id, name, slug, status, plan)
VALUES ('default-tenant-id', 'Default', 'default', 'active', 'enterprise');

-- Assign existing data to default tenant
UPDATE agents SET tenant_id = 'default-tenant-id' WHERE tenant_id IS NULL;

-- Make column required
ALTER TABLE agents ALTER COLUMN tenant_id SET NOT NULL;
```

## Best Practices

1. **Always use tenant context** - Never bypass tenant isolation
2. **Validate early** - Check tenant access at API boundary
3. **Fail secure** - Deny access if tenant unclear
4. **Monitor usage** - Track per-tenant metrics
5. **Test isolation** - Regular security audits
6. **Document limits** - Clear communication of plan limits

## Testing

```typescript
describe('Multi-tenancy', () => {
  it('should isolate data between tenants', async () => {
    const tenant1 = await createTestTenant('tenant1');
    const tenant2 = await createTestTenant('tenant2');

    // Create agents in different tenants
    await runWithTenantContext({ tenantId: tenant1.id }, async () => {
      await agentService.create({ name: 'Agent 1' });
    });

    await runWithTenantContext({ tenantId: tenant2.id }, async () => {
      await agentService.create({ name: 'Agent 2' });
    });

    // Verify isolation
    await runWithTenantContext({ tenantId: tenant1.id }, async () => {
      const agents = await agentService.list();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Agent 1');
    });
  });
});
```

## Next Steps

- [Security Best Practices](./security.md)
- [API Authentication](./authentication.md)
- [Deployment Guide](./deployment.md)