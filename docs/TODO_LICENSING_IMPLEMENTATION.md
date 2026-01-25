# TODO: Licensing Implementation

> Checklist for implementing the simplified licensing strategy.
> See `LICENSING_STRATEGY.md` for full context.
> See `TODO_ENTERPRISE_FEATURES.md` for completing enterprise features to 100%.

## Status: COMPLETE

All licensing implementation tasks have been completed. The remaining work is in `TODO_ENTERPRISE_FEATURES.md`.

---

## Summary

- **Delete** the Tenant system (unnecessary complexity) - DONE
- **Update** License Enforcer to match new feature list - DONE
- **Add** license checks to Enterprise features (dashboard, persistence, etc.) - DONE
- **Update** documentation and messaging - DONE

---

## Phase 1: Remove Tenant System - COMPLETE

The `packages/tenant/` package was designed for a multi-tenant SaaS model we're not pursuing.

- [x] Delete `packages/tenant/` directory entirely
- [x] Remove tenant references from `packages/control-plane/`
- [x] Update `pnpm-workspace.yaml` if tenant is listed
- [x] Run build to ensure no broken imports

---

## Phase 2: Update License Enforcer - COMPLETE

**File:** `packages/control-plane/src/licensing/license-enforcer.ts`

- [x] Remove any agent limit code/concepts
- [x] Update feature lists to match strategy (OSS, Enterprise, Enterprise Plus)
- [x] Add `requireFeature(feature: string)` that throws `UpgradeRequiredError`
- [x] Add `getEditionName()` for display purposes
- [x] Add `getUpgradeUrl(feature: string)` for upgrade prompts
- [x] Update messaging - friendly upgrade prompts

---

## Phase 3: Add License Checks - COMPLETE

### 3.1 Dashboard - DONE

**Files Created:**
- `apps/web-dashboard/src/components/license/license-provider.tsx`
- `apps/web-dashboard/src/components/license/upgrade-prompt.tsx`
- `apps/web-dashboard/src/components/license/index.ts`

**Updated:**
- `apps/web-dashboard/src/app/layout.tsx` - wraps app in LicenseProvider

### 3.2 API Endpoint - DONE

**File Created:** `packages/control-plane/src/api/license.ts`

Endpoints:
- `GET /api/license` - Returns license info
- `GET /api/license/features` - Returns available features
- `GET /api/license/check/:feature` - Check specific feature availability

### 3.3 Server Integration - DONE

**File Updated:** `packages/control-plane/src/server.ts`
- Added LicenseEnforcer initialization
- Added license router mounting

---

## Phase 4: Update Documentation - COMPLETE

- [x] `sites/docs/docs/enterprise/overview.md` - Rewritten to match strategy
- [x] `docs/LICENSING_STRATEGY.md` - Created canonical strategy document
- [x] `docs/TODO_LICENSING_IMPLEMENTATION.md` - This file

---

## Phase 5: Testing - PENDING

- [ ] Test OSS mode (no license key)
  - [ ] Patterns execute with unlimited agents
  - [ ] Dashboard shows upgrade prompt
  - [ ] License endpoint returns OSS info

- [ ] Test Enterprise mode (with license key)
  - [ ] All features available
  - [ ] Dashboard shows data
  - [ ] License endpoint returns Enterprise info

- [ ] Test invalid license key
  - [ ] Falls back to OSS gracefully
  - [ ] Shows helpful error message

---

## What's Next

The licensing system is complete. To bring enterprise features to 100%, see:

**`docs/TODO_ENTERPRISE_FEATURES.md`**

Remaining work:
1. **High Availability** (40% → 100%) - Leader election, clustering logic
2. **Scheduled Patterns** (30% → 100%) - Cron scheduler, job queue
3. **Web Dashboard** (35% → 100%) - Patterns, Executions, Settings, Users pages
4. **RBAC API Integration** (85% → 100%) - Wire auth to API routes
5. **SSO/SAML** (75% → 100%) - SAML implementation
