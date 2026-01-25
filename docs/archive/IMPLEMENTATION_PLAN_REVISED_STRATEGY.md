# Implementation Plan: Revised Open Source Strategy

## Executive Summary

This document outlines all changes needed to align the Parallax codebase with the revised open source strategy where:
- **Open Source = Unlimited agents locally, no artificial limits**
- **Enterprise = Production features (persistence, HA, distributed, teams)**

---

## Current State Analysis

### Dual Licensing System (Potential Conflict)

The codebase currently has **two separate systems** for limits:

| System | Purpose | Location |
|--------|---------|----------|
| **License Enforcer** | Infrastructure-level (OSS vs Enterprise) | `packages/control-plane/src/licensing/` |
| **Tenant Plans** | Multi-tenant SaaS tiers (Free/Starter/Pro/Enterprise) | `packages/tenant/` |

**Key Question:** Do we need both systems?

- **License Enforcer** = For self-hosted deployments (OSS vs Enterprise license key)
- **Tenant Plans** = For managed cloud hosting (SaaS tiers)

**Recommendation:** Keep both but align them:
- Self-hosted OSS → Unlimited agents, no production features
- Self-hosted Enterprise → All features unlocked
- Cloud Free tier → Generous limits, limited production features
- Cloud Paid tiers → Scale limits, all features

---

## Changes Required

### 1. License Enforcer Updates

**File:** `packages/control-plane/src/licensing/license-enforcer.ts`

#### Current State:
- `enforceAgentLimit()` exists but returns all agents (no limit enforced)
- Features list includes `unlimited_agents` for enterprise

#### Changes Needed:

```typescript
// REMOVE these concepts entirely:
- unlimited_agents feature flag (all editions have unlimited agents)

// UPDATE feature list to match new strategy:
const OPENSOURCE_FEATURES = [
  'core_patterns',
  'local_agents',      // Unlimited local agents
  'basic_cli',
  'pattern_builder',   // Visual builder
  'in_memory_execution',
];

const ENTERPRISE_FEATURES = [
  ...OPENSOURCE_FEATURES,
  'persistence',           // PostgreSQL/TimescaleDB
  'distributed_execution', // Multi-node
  'high_availability',     // Clustering, failover
  'web_dashboard',         // Monitoring UI
  'scheduled_patterns',    // Cron, triggers
  'execution_history',     // Audit logs
  'pattern_versioning',    // Rollback support
  'metrics_alerting',      // Prometheus/Grafana
  'backup_restore',        // Data backup
  'api_keys',              // Automation tokens
];

const ENTERPRISE_PLUS_FEATURES = [
  ...ENTERPRISE_FEATURES,
  'multi_region',          // Geographic distribution
  'multi_user',            // Team collaboration
  'rbac',                  // Role-based access
  'sso_integration',       // SAML/OIDC
  'advanced_analytics',    // ML-powered insights
  'pattern_marketplace',   // Share/sell patterns
  'priority_support',      // SLA guarantees
  'custom_features',       // Bespoke development
];

// DELETE the enforceAgentLimit method entirely
// or have it always return all agents with a deprecation warning
```

#### Messaging Updates:

```typescript
// CURRENT (bad):
"Upgrade to Enterprise for more agents"

// NEW (good):
"Parallax Open Source - Full power, locally!"
"Upgrade to Enterprise for production deployment features"
```

---

### 2. Tenant Plan Updates

**File:** `packages/tenant/src/types.ts`

#### Current State:
```typescript
export const DEFAULT_LIMITS: Record<TenantPlan, TenantLimits> = {
  FREE: {
    maxAgents: 3,           // ❌ REMOVE THIS LIMIT
    maxExecutions: 1000,
    // ...
  },
  STARTER: {
    maxAgents: 10,          // ❌ REMOVE THIS LIMIT
    // ...
  },
  // ...
};
```

#### Changes Needed:

```typescript
export const DEFAULT_LIMITS: Record<TenantPlan, TenantLimits> = {
  FREE: {
    maxAgents: -1,              // ✅ Unlimited
    maxExecutions: 5000,        // Generous free tier
    maxExecutionsPerMinute: 20,
    maxStorageGB: 1,            // Limited history storage
    maxRetentionDays: 7,        // 1 week history
  },
  STARTER: {
    maxAgents: -1,              // ✅ Unlimited
    maxExecutions: 50000,
    maxExecutionsPerMinute: 100,
    maxStorageGB: 25,
    maxRetentionDays: 30,
  },
  PROFESSIONAL: {
    maxAgents: -1,              // ✅ Unlimited
    maxExecutions: 500000,
    maxExecutionsPerMinute: 500,
    maxStorageGB: 250,
    maxRetentionDays: 90,
  },
  ENTERPRISE: {
    maxAgents: -1,              // ✅ Unlimited
    maxExecutions: -1,          // Unlimited
    maxExecutionsPerMinute: -1,
    maxStorageGB: -1,
    maxRetentionDays: 365,
  },
};
```

#### Feature Updates:

```typescript
// Align features with production vs development distinction
export const PLAN_FEATURES: Record<TenantPlan, TenantFeatures> = {
  FREE: {
    // Development features (all free)
    apiAccess: true,
    customPatterns: true,
    patternBuilder: true,

    // Production features (limited/none)
    persistence: false,        // In-memory only
    scheduledPatterns: false,
    executionHistory: false,   // No history retention
    advancedAnalytics: false,
    ssoEnabled: false,
    teamWorkspaces: false,
    prioritySupport: false,
  },
  STARTER: {
    // All free features plus:
    persistence: true,
    scheduledPatterns: true,
    executionHistory: true,
    auditLogs: true,
    // Still no:
    advancedAnalytics: false,
    ssoEnabled: false,
    teamWorkspaces: false,
  },
  // ... etc
};
```

---

### 3. Database Schema Updates

**File:** `packages/control-plane/prisma/schema.prisma`

#### Changes Needed:

The `Pattern` model has `minAgents` and `maxAgents` fields. These are **pattern-level** constraints (how many agents a specific pattern needs), NOT license limits. **Keep these.**

```prisma
model Pattern {
  // These are pattern requirements, not license limits
  minAgents    Int      @default(1)   // Minimum agents needed for this pattern
  maxAgents    Int?                    // Maximum agents (null = no max)

  // Add new production-only features
  scheduledCron    String?           // Enterprise: cron expression
  isVersioned      Boolean @default(false)  // Enterprise: version tracking
}
```

---

### 4. Middleware Updates

**File:** `packages/tenant/src/tenant-middleware.ts`

#### Changes Needed:

```typescript
// UPDATE checkLimit to handle -1 (unlimited) properly
checkLimit(limitName: keyof TenantLimits, currentValue: number): boolean {
  const limit = this.tenant.limits[limitName];

  // -1 means unlimited
  if (limit === -1) return true;

  return currentValue < limit;
}

// ADD production feature check
requireProductionFeature(feature: string): void {
  const productionFeatures = [
    'persistence',
    'scheduledPatterns',
    'executionHistory',
    'advancedAnalytics',
    'ssoEnabled',
    'teamWorkspaces',
  ];

  if (productionFeatures.includes(feature) && !this.hasFeature(feature)) {
    throw new UpgradeRequiredError(
      `${feature} requires a paid plan. Upgrade at parallax.ai/pricing`,
      feature
    );
  }
}
```

---

### 5. CLI Updates

**Files:**
- `packages/cli/src/commands/*.ts`
- `packages/cli/src/utils/messaging.ts` (create if needed)

#### Changes Needed:

```typescript
// Banner for open source
const OPENSOURCE_BANNER = `
╔══════════════════════════════════════════════════════════════╗
║  🎉 Parallax Open Source - Full Power, No Limits!            ║
║                                                              ║
║  ✓ Unlimited agents    ✓ All patterns    ✓ Full features    ║
║                                                              ║
║  Ready for production? Get persistence, HA & team features:  ║
║  → parallax.ai/enterprise                                    ║
╚══════════════════════════════════════════════════════════════╝
`;

// Message when hitting production-only feature
const PRODUCTION_FEATURE_MESSAGE = (feature: string) => `
This feature (${feature}) requires Parallax Enterprise for:
  • Persistent state across restarts
  • Distributed execution across nodes
  • Team collaboration and access control

Start a 30-day free trial: parallax deploy --trial
`;
```

---

### 6. Documentation Updates

#### Files to Update:

| File | Changes |
|------|---------|
| `sites/docs/docs/enterprise/overview.md` | Update feature comparison table |
| `sites/docs/docs/intro.md` | Update open source section |
| `sites/docs/docs/getting-started/installation.md` | Clarify OSS vs Enterprise |
| `README.md` (root) | Update positioning |

#### Key Messaging Changes:

**OLD:**
> Open Source: 3 agents max, upgrade for more

**NEW:**
> Open Source: Unlimited agents locally. Upgrade for production deployment features.

---

### 7. Dashboard Updates

**File:** `apps/web-dashboard/src/components/layout/sidebar.tsx`

The web dashboard is an **Enterprise feature**. When accessed without enterprise license:

```tsx
// Show upgrade prompt instead of dashboard
if (!hasEnterpriseLicense) {
  return <UpgradePrompt
    feature="Web Dashboard"
    benefits={[
      "Real-time monitoring",
      "Execution history",
      "Agent management",
      "Performance analytics"
    ]}
  />;
}
```

---

### 8. Pattern Engine Updates

**File:** `packages/control-plane/src/pattern-engine/pattern-engine.ts`

#### Current State:
- Respects `pattern.maxAgents` for agent selection
- No license-based limits applied

#### Changes Needed:
- **Keep pattern-level maxAgents** (this is a pattern requirement, not a limit)
- **Remove any license-based agent limiting code**
- **Add production feature checks:**

```typescript
async executePattern(pattern: Pattern, input: any): Promise<Result> {
  // Check for production-only features used in pattern
  if (pattern.scheduledCron && !this.license.hasFeature('scheduled_patterns')) {
    throw new UpgradeRequiredError('Scheduled patterns require Enterprise');
  }

  if (pattern.requiresPersistence && !this.license.hasFeature('persistence')) {
    throw new UpgradeRequiredError('This pattern requires persistent state');
  }

  // Execute normally - no agent limits!
  const agents = await this.selectAgents(pattern);
  // ...
}
```

---

## Migration Checklist

### Phase 1: Core Changes (Must Do)

- [ ] Update `license-enforcer.ts` - Remove agent limit concept
- [ ] Update `types.ts` - Set all `maxAgents` to -1
- [ ] Update `tenant-middleware.ts` - Handle unlimited properly
- [ ] Update enterprise docs - New feature comparison
- [ ] Update intro docs - New positioning

### Phase 2: Messaging (Should Do)

- [ ] Add CLI banners and upgrade prompts
- [ ] Update error messages for production features
- [ ] Add dashboard upgrade prompt component
- [ ] Update README with new positioning

### Phase 3: Feature Gating (Nice to Have)

- [ ] Implement actual persistence feature gate
- [ ] Implement scheduled patterns feature gate
- [ ] Implement dashboard license check
- [ ] Add telemetry for upgrade prompt impressions

---

## Potential Issues & Considerations

### 1. Backward Compatibility

**Issue:** Users may have code checking for agent limits
**Solution:** Deprecate gracefully, return unlimited for 2 versions before removing

### 2. Tenant vs License Confusion

**Issue:** Two systems for limits is confusing
**Solution:**
- License = Self-hosted (OSS/Enterprise binary)
- Tenant = Cloud hosting (tiered SaaS)
- Document clearly when each applies

### 3. Pattern maxAgents Confusion

**Issue:** Pattern `maxAgents` might be confused with license limits
**Solution:**
- Rename to `agentPoolSize` or `preferredAgentCount`?
- Or document clearly that this is a pattern requirement

### 4. Free Tier Abuse (Cloud)

**Issue:** Unlimited agents on free cloud tier could be abused
**Solution:**
- Keep execution-per-minute rate limits
- Keep storage limits
- Unlimited agents but limited throughput

### 5. Dashboard Access

**Issue:** Dashboard exists, should OSS users see it?
**Solution Options:**
- A) Dashboard is Enterprise-only (current plan)
- B) Dashboard is OSS but shows "upgrade for history" prompts
- C) Basic dashboard for all, advanced for Enterprise

**Recommendation:** Option B - let them see it, upsell on features

---

## Success Metrics

After implementing this strategy, measure:

1. **Adoption:** GitHub stars, npm downloads, Docker pulls
2. **Activation:** % of installs that run 10+ patterns
3. **Conversion:** % that request Enterprise trial
4. **Sentiment:** Community feedback, NPS score

---

## Timeline Estimate

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1 | Core code changes | 2-3 hours |
| Phase 2 | Messaging & UX | 2-3 hours |
| Phase 3 | Feature gating | 4-6 hours |
| Testing | End-to-end validation | 2-3 hours |

**Total:** 10-15 hours of development work

---

## Next Steps

1. Review this plan and confirm approach
2. Decide on Tenant vs License system question
3. Decide on Dashboard access question
4. Begin Phase 1 implementation
