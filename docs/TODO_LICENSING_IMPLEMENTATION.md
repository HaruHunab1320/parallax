# TODO: Licensing Implementation

> Checklist for implementing the simplified licensing strategy.
> See `LICENSING_STRATEGY.md` for full context.

## Summary

- **Delete** the Tenant system (unnecessary complexity)
- **Update** License Enforcer to match new feature list
- **Add** license checks to Enterprise features (dashboard, persistence, etc.)
- **Update** documentation and messaging

---

## Phase 1: Remove Tenant System

The `packages/tenant/` package was designed for a multi-tenant SaaS model we're not pursuing. Remove it.

- [ ] Delete `packages/tenant/` directory entirely
- [ ] Remove tenant references from `packages/control-plane/`
  - [ ] Check for imports from `@parallax/tenant`
  - [ ] Remove any tenant middleware usage
- [ ] Update `pnpm-workspace.yaml` if tenant is listed
- [ ] Run build to ensure no broken imports

**Why:** We're self-hosted only. One license = one deployment. No multi-tenancy needed.

---

## Phase 2: Update License Enforcer

**File:** `packages/control-plane/src/licensing/license-enforcer.ts`

### 2.1 Update Feature Lists

- [ ] Remove any agent limit code/concepts
- [ ] Update feature lists to match strategy:

```typescript
const OPENSOURCE_FEATURES = [
  'unlimited_agents',
  'all_patterns',
  'pattern_builder',
  'cli_full',
  'local_execution',
  'prism_dsl',
];

const ENTERPRISE_FEATURES = [
  ...OPENSOURCE_FEATURES,
  'persistence',
  'execution_history',
  'web_dashboard',
  'metrics_storage',
  'scheduled_patterns',
  'high_availability',
  'distributed_execution',
  'multi_user',
  'rbac',
  'sso_integration',
  'api_keys',
  'backup_restore',
  'priority_support',
];

const ENTERPRISE_PLUS_FEATURES = [
  ...ENTERPRISE_FEATURES,
  'multi_region',
  'advanced_analytics',
  'pattern_marketplace',
  'custom_features',
  'support_24_7',
];
```

### 2.2 Add Helper Methods

- [ ] Add `requireFeature(feature: string)` that throws `UpgradeRequiredError`
- [ ] Add `getEditionName()` for display purposes
- [ ] Add `getUpgradeUrl(feature: string)` for upgrade prompts

### 2.3 Update Messaging

- [ ] Remove any "upgrade for more agents" language
- [ ] Add friendly upgrade prompts pointing to production features

---

## Phase 3: Add License Checks

### 3.1 Dashboard

**File:** `apps/web-dashboard/`

- [ ] Add license check on app load
- [ ] Show upgrade prompt if no enterprise license
- [ ] Or: Allow viewing but show "no data" with upgrade CTA

### 3.2 Persistence

**File:** `packages/control-plane/src/` (wherever persistence is configured)

- [ ] Check license before enabling PostgreSQL connection
- [ ] Graceful fallback to in-memory with message

### 3.3 API Endpoints

- [ ] `/api/history` - Requires `execution_history` feature
- [ ] `/api/metrics` (historical) - Requires `metrics_storage` feature
- [ ] `/api/schedules` - Requires `scheduled_patterns` feature
- [ ] `/api/users` - Requires `multi_user` feature

### 3.4 CLI Commands

**File:** `packages/cli/src/commands/`

- [ ] `parallax history` - Check for persistence feature
- [ ] `parallax schedule` - Check for scheduled_patterns feature
- [ ] `parallax users` - Check for multi_user feature
- [ ] Add helpful upgrade messages when features unavailable

---

## Phase 4: Update Documentation

### 4.1 Docs Site

- [ ] `sites/docs/docs/enterprise/overview.md` - Rewrite to match strategy
- [ ] `sites/docs/docs/intro.md` - Update OSS description
- [ ] `sites/docs/docs/getting-started/installation.md` - Add license info
- [ ] Add new page: `sites/docs/docs/enterprise/licensing.md`

### 4.2 READMEs

- [ ] Root `README.md` - Update feature list and OSS vs Enterprise
- [ ] `packages/control-plane/README.md` - Add licensing section
- [ ] `packages/cli/README.md` - Document enterprise commands

### 4.3 CLI Help Text

- [ ] Update `--help` output to clarify OSS vs Enterprise features
- [ ] Add `parallax license` command to show current license status

---

## Phase 5: Testing

- [ ] Test OSS mode (no license key)
  - [ ] Patterns execute with unlimited agents ✓
  - [ ] History/metrics commands show upgrade prompt ✓
  - [ ] Dashboard shows upgrade prompt ✓

- [ ] Test Enterprise mode (with license key)
  - [ ] All features available ✓
  - [ ] Persistence works ✓
  - [ ] Dashboard shows data ✓

- [ ] Test invalid license key
  - [ ] Falls back to OSS gracefully ✓
  - [ ] Shows helpful error message ✓

---

## Files to Modify

| File | Action |
|------|--------|
| `packages/tenant/` | **DELETE** entire directory |
| `packages/control-plane/src/licensing/license-enforcer.ts` | **UPDATE** feature lists |
| `packages/control-plane/src/api/*.ts` | **ADD** license checks |
| `apps/web-dashboard/src/app/layout.tsx` | **ADD** license check |
| `packages/cli/src/commands/*.ts` | **ADD** license checks + messages |
| `sites/docs/docs/enterprise/overview.md` | **REWRITE** |
| `sites/docs/docs/intro.md` | **UPDATE** |

---

## Definition of Done

- [ ] No agent limits anywhere in codebase
- [ ] Tenant package deleted
- [ ] License enforcer aligned with strategy
- [ ] Dashboard requires enterprise license
- [ ] Persistence requires enterprise license
- [ ] CLI shows helpful upgrade prompts
- [ ] Docs updated to reflect strategy
- [ ] All tests pass
- [ ] Manual testing confirms behavior

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Remove Tenant | 30 min |
| Phase 2: Update Enforcer | 1-2 hours |
| Phase 3: Add License Checks | 2-3 hours |
| Phase 4: Update Docs | 1-2 hours |
| Phase 5: Testing | 1 hour |
| **Total** | **6-8 hours** |

---

## Notes

- Keep the UX friendly - OSS users should feel welcomed, not blocked
- Upgrade prompts should explain VALUE, not just say "pay us"
- Consider: Free 30-day trial command (`parallax deploy --trial`)
- Future: Might add cloud/SaaS tier, but not now - keep it simple
