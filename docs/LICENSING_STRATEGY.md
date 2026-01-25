# Parallax Licensing Strategy

> **Status:** Active Development Strategy
> **Last Updated:** January 2025

## Overview

Parallax uses a simple two-tier licensing model designed to maximize adoption while monetizing production deployments.

```
┌─────────────────────────────────────────────────────────────────┐
│                         PARALLAX                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Open Source (No License Key Required)                         │
│   ├── Unlimited agents                                          │
│   ├── All patterns & pattern types                              │
│   ├── Full local execution                                      │
│   ├── Pattern Builder (visual + YAML)                           │
│   ├── CLI with all commands                                     │
│   └── In-memory only (no persistence)                           │
│                                                                 │
│   Enterprise (License Key: PARALLAX-ENT-xxxx)                   │
│   ├── Everything in Open Source, plus:                          │
│   ├── Persistence (PostgreSQL/TimescaleDB)                      │
│   ├── Execution History & Audit Logs                            │
│   ├── Web Dashboard (metrics, monitoring, management)           │
│   ├── High Availability (clustering, failover)                  │
│   ├── Distributed Execution (multi-node)                        │
│   ├── Scheduled Patterns (cron, triggers)                       │
│   ├── Multi-user / RBAC                                         │
│   ├── SSO Integration (SAML, OIDC)                              │
│   ├── Priority Support & SLA                                    │
│   └── Multi-region (Enterprise Plus)                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Core Principle

> **"Don't limit what makes Parallax magical."**

Multi-agent orchestration with unlimited agents IS the magic. We don't artificially limit that.

Instead, we charge for what makes Parallax **production-ready**:
- Persistence (history, metrics, audit trails)
- Reliability (HA, distributed execution)
- Operations (dashboard, scheduling, monitoring)
- Teams (multi-user, RBAC, SSO)
- Support (SLA, priority assistance)

---

## Open Source Edition

### What's Included

| Feature | Description |
|---------|-------------|
| **Unlimited Agents** | No cap on agent count, locally or in patterns |
| **All Pattern Types** | Voting, consensus, merge, sequential, conditional |
| **Pattern Builder** | Visual drag-and-drop + YAML editing |
| **Full CLI** | All commands: run, validate, build, etc. |
| **Prism DSL** | Full language support, YAML compilation |
| **Local Execution** | Single-machine, full-featured execution |

### What's NOT Included (In-Memory Limitations)

| Limitation | Impact |
|------------|--------|
| **No Persistence** | Execution results not saved; lost on restart |
| **No History** | Cannot view past executions or audit trails |
| **No Metrics Storage** | Real-time only, no historical charts |
| **No Scheduling** | Cannot schedule patterns (no state to track) |
| **No Dashboard** | Dashboard needs data to display |
| **Single User** | No auth, no RBAC, no team features |
| **Community Support** | GitHub issues, Discord, no SLA |

### Ideal For

- Learning and experimentation
- Development and testing
- Small projects and prototypes
- CI/CD pipeline integration (stateless)
- Individual developers

---

## Enterprise Edition

### What's Included

Everything in Open Source, plus:

| Feature | Description |
|---------|-------------|
| **Persistence** | PostgreSQL/TimescaleDB for all execution data |
| **Execution History** | Full audit trail of every pattern run |
| **Web Dashboard** | Real-time monitoring, metrics, agent management |
| **Metrics & Analytics** | Historical charts, trends, performance analysis |
| **Scheduled Patterns** | Cron expressions, event triggers, recurring jobs |
| **High Availability** | Multi-node clustering, automatic failover |
| **Distributed Execution** | Scale across multiple machines |
| **Multi-user** | Multiple accounts, team workspaces |
| **RBAC** | Role-based access control (admin, operator, viewer) |
| **SSO Integration** | SAML, OIDC, Azure AD, Okta, Google |
| **API Keys** | Automation tokens with scoped permissions |
| **Backup & Restore** | Data protection and disaster recovery |
| **Priority Support** | Email support with SLA guarantees |

### Ideal For

- Production deployments
- Teams and organizations
- Compliance requirements (audit logs)
- High-reliability systems
- Large-scale operations

---

## Enterprise Plus Edition

Everything in Enterprise, plus:

| Feature | Description |
|---------|-------------|
| **Multi-region** | Geographic distribution, data residency |
| **Advanced Analytics** | ML-powered insights, anomaly detection |
| **Pattern Marketplace** | Share/publish patterns (future) |
| **Custom Features** | Bespoke development for your needs |
| **24/7 Support** | Round-the-clock assistance |
| **Architecture Reviews** | Expert guidance on deployment |

---

## Pricing

| Edition | Price | Includes |
|---------|-------|----------|
| **Open Source** | Free forever | Unlimited local usage |
| **Enterprise** | $500/month per node | 3-node minimum, business hours support |
| **Enterprise Plus** | $2,000/month per node | Multi-region, 24/7 support |

Annual discounts: 20% off with yearly commitment

### Free Trial

- 30-day Enterprise trial with `parallax deploy --trial`
- Full features, no credit card required
- Converts to Open Source after trial (no data loss if you export)

---

## License Detection

The control plane detects license type via:

```bash
# Environment variable
PARALLAX_LICENSE_KEY=PARALLAX-ENT-xxxx-xxxx-xxxx

# Or file
/etc/parallax/license.key

# Or Kubernetes secret
kubectl create secret generic parallax-license --from-literal=key=PARALLAX-ENT-xxxx
```

### License Key Format

```
PARALLAX-{TIER}-{RANDOM}

Examples:
PARALLAX-ENT-a1b2-c3d4-e5f6      # Enterprise
PARALLAX-PLUS-x9y8-z7w6-v5u4    # Enterprise Plus
```

No license key = Open Source edition (fully functional, in-memory only)

---

## Feature Gating Implementation

### How It Works

```typescript
// In control plane startup
const license = LicenseEnforcer.detect();

// When user tries to enable persistence
if (config.persistence.enabled && !license.hasFeature('persistence')) {
  throw new UpgradeRequiredError(
    'Persistence requires Parallax Enterprise.',
    'persistence',
    'https://parallax.ai/enterprise'
  );
}

// When user accesses dashboard
if (request.path.startsWith('/dashboard') && !license.hasFeature('web_dashboard')) {
  return redirect('/upgrade?feature=dashboard');
}

// Patterns always run - no agent limits!
const result = await patternEngine.execute(pattern, input); // ✅ Always works
```

### Feature List by Edition

```typescript
const FEATURES = {
  opensource: [
    'unlimited_agents',
    'all_patterns',
    'pattern_builder',
    'cli_full',
    'local_execution',
    'prism_dsl',
  ],

  enterprise: [
    // All opensource features, plus:
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
  ],

  enterprise_plus: [
    // All enterprise features, plus:
    'multi_region',
    'advanced_analytics',
    'pattern_marketplace',
    'custom_features',
    'support_24_7',
  ],
};
```

---

## User Experience

### Open Source User Journey

```
1. Install Parallax
   $ npm install -g @parallax/cli

2. Create and run patterns
   $ parallax run my-pattern.yaml --input '{"text": "hello"}'
   Result: { sentiment: "positive", confidence: 0.94 }

3. Everything works! Unlimited agents, all features.

4. User restarts machine...
   $ parallax history
   ℹ️  No execution history available.
   💡 Execution history requires Parallax Enterprise.
      Start a free trial: parallax deploy --trial

5. User wants to schedule a pattern...
   $ parallax schedule my-pattern.yaml --cron "0 * * * *"
   ℹ️  Scheduled patterns require Parallax Enterprise.
   💡 Start a free trial: parallax deploy --trial

6. User realizes they need production features → Upgrades
```

### Enterprise User Journey

```
1. Start trial
   $ parallax deploy --trial
   ✅ 30-day Enterprise trial activated
   ✅ PostgreSQL configured
   ✅ Dashboard available at http://localhost:3000

2. Everything persists
   $ parallax history
   ┌────────────┬─────────────────┬──────────┐
   │ ID         │ Pattern         │ Status   │
   ├────────────┼─────────────────┼──────────┤
   │ exec_001   │ sentiment       │ success  │
   │ exec_002   │ classifier      │ success  │
   └────────────┴─────────────────┴──────────┘

3. Dashboard shows metrics, charts, agent status

4. Schedule patterns
   $ parallax schedule my-pattern.yaml --cron "0 * * * *"
   ✅ Pattern scheduled: runs every hour

5. Add team members
   $ parallax users add alice@company.com --role operator
   ✅ User invited

6. Trial ends → Purchase or downgrade to OSS
```

---

## Migration Path

### OSS → Enterprise

```bash
# 1. Get license key from parallax.ai
# 2. Set environment variable
export PARALLAX_LICENSE_KEY=PARALLAX-ENT-xxxx

# 3. Enable persistence
parallax config set persistence.enabled true
parallax config set persistence.url postgresql://...

# 4. Restart control plane
parallax restart

# 5. All new executions are now persisted
```

### Enterprise → OSS (Downgrade)

```bash
# 1. Export any data you need
parallax export executions --output history.json
parallax export patterns --output patterns.zip

# 2. Remove license key
unset PARALLAX_LICENSE_KEY

# 3. Restart (runs in-memory mode)
parallax restart

# Note: Historical data no longer accessible, but patterns still run
```

---

## Comparison with Competitors

| Feature | Parallax OSS | Parallax Enterprise | LangChain | CrewAI |
|---------|--------------|---------------------|-----------|--------|
| Unlimited Agents | ✅ | ✅ | ✅ | ❌ (limits) |
| Multi-agent Voting | ✅ | ✅ | ❌ | ❌ |
| Confidence Scoring | ✅ | ✅ | ❌ | ❌ |
| Persistence | ❌ | ✅ | ❌ | ❌ |
| Web Dashboard | ❌ | ✅ | ❌ | ❌ |
| Scheduling | ❌ | ✅ | ❌ | ❌ |
| High Availability | ❌ | ✅ | ❌ | ❌ |

---

## FAQ

**Q: Can I use OSS in production?**
A: Yes, but without persistence you lose history on restart. Fine for stateless workloads.

**Q: What happens when my trial ends?**
A: You can continue using OSS features. Persistence stops, but patterns still run.

**Q: Can I self-host Enterprise?**
A: Yes, Enterprise is fully self-hosted. We don't offer managed cloud (yet).

**Q: Is there a free tier with persistence?**
A: Not currently. Persistence requires infrastructure that has real costs.

**Q: Can I contribute to OSS and get Enterprise free?**
A: Major contributors may qualify for free Enterprise licenses. Contact us.

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| License detection | ✅ Complete | `packages/control-plane/src/licensing/` |
| Feature gating | ✅ Complete | All enterprise features license-gated |
| Persistence | ✅ Complete | PostgreSQL/TimescaleDB with Prisma |
| Dashboard | ✅ Complete | Full monitoring, patterns, executions, settings |
| High Availability | ✅ Complete | Leader election, distributed locks, state sync |
| Scheduling | ✅ Complete | Cron-based scheduling with HA support |
| Triggers | ✅ Complete | Webhooks and event-based triggers |
| Multi-user/RBAC | ✅ Complete | Users, roles, API keys, audit logs |
| SSO/OIDC | 🔄 Partial | OIDC ready, SAML integration pending |
| Kubernetes | ✅ Complete | Helm charts for production deployment |

---

## What's NOT Included (Future Roadmap)

| Feature | Status | Notes |
|---------|--------|-------|
| Agent Hosting | ❌ Not built | See `AGENT_HOSTING_STRATEGY.md` |
| SAML SSO | 🔄 Partial | OIDC complete, SAML pending |
| Pattern Marketplace | ❌ Not built | Enterprise Plus future feature |
| Advanced Analytics | ❌ Not built | Enterprise Plus future feature |

---

## Deployment Options

### Self-Hosted (Current)

All editions are self-hosted. Customers run Parallax on their own infrastructure:
- Local development (Docker Compose)
- Kubernetes (Helm charts provided)
- VM/bare metal

### Managed Cloud (Future)

Not currently offered. May be considered post-launch based on customer demand.

---

## TODO: Remaining Tasks

### Documentation
- [ ] Update `sites/docs/docs/enterprise/overview.md`
- [ ] Update main README with enterprise features
- [ ] Create pricing page content

### Polish
- [ ] SAML SSO integration
- [ ] CLI upgrade prompts refinement

---

## Archived Strategies

Previous strategies that were considered but rejected:

- `docs/archive/OPENSOURCE_VS_ENTERPRISE_ARCHIVED.md` - Agent limits approach (rejected: feels artificial)
- `docs/REVISED_OPENSOURCE_STRATEGY.md` - Transition document (superseded by this)

This document is the canonical licensing strategy.
