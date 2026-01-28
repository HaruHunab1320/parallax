---
sidebar_position: 1
title: Overview
---

# Enterprise Features

Parallax Enterprise adds production-grade capabilities for teams and organizations running multi-agent orchestration in production.

## Open Source vs Enterprise

Parallax Open Source is **fully featured for local development** — unlimited agents, all patterns, complete CLI. Enterprise adds what you need for **production deployments**.

### Open Source (Free Forever)
- ✅ Unlimited agents
- ✅ All pattern types (voting, consensus, merge, etc.)
- ✅ Pattern Builder (visual + YAML)
- ✅ Full Prism DSL support
- ✅ Complete CLI
- ❌ In-memory only (state lost on restart)

### Enterprise
- ✅ Everything in Open Source, plus:
- ✅ Persistence (PostgreSQL/TimescaleDB)
- ✅ Execution history & audit logs
- ✅ Web Dashboard
- ✅ Scheduled patterns (cron, triggers)
- ✅ High Availability (clustering, failover)
- ✅ Multi-user / RBAC
- ✅ SSO Integration (SAML, OIDC)
- ✅ Priority Support

### Enterprise Plus
- ✅ Everything in Enterprise, plus:
- ✅ Multi-region deployment
- ✅ Advanced analytics
- ✅ 24/7 Support
- ✅ Custom feature development

## Feature Comparison

| Feature | Open Source | Enterprise | Enterprise Plus |
|---------|:-----------:|:----------:|:---------------:|
| **Core Features** | | | |
| Unlimited agents | ✅ | ✅ | ✅ |
| All pattern types | ✅ | ✅ | ✅ |
| Pattern Builder | ✅ | ✅ | ✅ |
| Prism DSL | ✅ | ✅ | ✅ |
| CLI | ✅ | ✅ | ✅ |
| REST & WebSocket API | ✅ | ✅ | ✅ |
| **Production Features** | | | |
| Persistence (PostgreSQL) | ❌ | ✅ | ✅ |
| Execution history | ❌ | ✅ | ✅ |
| Web Dashboard | ❌ | ✅ | ✅ |
| Scheduled patterns | ❌ | ✅ | ✅ |
| Metrics & analytics | ❌ | ✅ | ✅ |
| Backup & restore | ❌ | ✅ | ✅ |
| **Reliability** | | | |
| High Availability | ❌ | ✅ | ✅ |
| Distributed execution | ❌ | ✅ | ✅ |
| Multi-region | ❌ | ❌ | ✅ |
| **Team Features** | | | |
| Multi-user | ❌ | ✅ | ✅ |
| RBAC | ❌ | ✅ | ✅ |
| SSO (SAML/OIDC) | ❌ | ✅ | ✅ |
| API keys | ❌ | ✅ | ✅ |
| Audit logging | ❌ | ✅ | ✅ |
| **Support** | | | |
| Community support | ✅ | ✅ | ✅ |
| Priority support | ❌ | ✅ | ✅ |
| 24/7 support | ❌ | ❌ | ✅ |
| SLA guarantee | ❌ | ✅ | ✅ |

## Why Upgrade?

### Open Source is Great For:

- Learning and experimentation
- Development and testing
- Small projects and prototypes
- CI/CD pipeline integration (stateless)
- Individual developers

### Enterprise is Essential For:

- **Production deployments** — You need persistence so data survives restarts
- **Debugging & compliance** — Execution history and audit logs
- **Monitoring** — Web dashboard with real-time metrics
- **Automation** — Scheduled patterns and event triggers
- **Teams** — Multi-user access with proper permissions
- **Reliability** — HA clustering for zero downtime

## Pricing

| Edition | Price | Best For |
|---------|-------|----------|
| **Open Source** | Free forever | Development, testing, learning |
| **Enterprise** | $500/month per node | Production deployments |
| **Enterprise Plus** | $2,000/month per node | Multi-region, 24/7 support |

- Minimum 3 nodes for Enterprise
- Annual discount: 20% off
- 30-day free trial available

## Quick Start

### 1. Start Free Trial

```bash
# Start a 30-day Enterprise trial
parallax deploy --trial

# Or set your license key
export PARALLAX_LICENSE_KEY=PARALLAX-ENT-xxxx-xxxx-xxxx
```

### 2. Enable Persistence

```bash
# Configure PostgreSQL
parallax config set persistence.enabled true
parallax config set persistence.url postgresql://user:pass@localhost:5432/parallax

# Restart to apply
parallax restart
```

### 3. Access Dashboard

Open http://localhost:3000 to access the web dashboard.

### 4. Invite Team Members

```bash
parallax users add alice@company.com --role operator
parallax users add bob@company.com --role viewer
```

## Architecture

```mermaid
flowchart TB
  LB["Load Balancer"] --> CP1["Control Plane 1\n(Leader)"]
  LB --> CP2["Control Plane 2\n(Follower)"]
  LB --> CP3["Control Plane 3\n(Follower)"]

  CP1 --> Redis["Redis Cluster\n(State sync)"]
  CP2 --> Redis
  CP3 --> Redis

  CP1 --> DB["PostgreSQL/\nTimescaleDB"]
  CP2 --> DB
  CP3 --> DB
```

## Deployment Options

### Kubernetes (Recommended)

```bash
# Add Helm repository
helm repo add parallax https://charts.parallax.ai
helm repo update

# Install with Enterprise license
helm install parallax parallax/parallax \
  --namespace parallax \
  --create-namespace \
  --set license.key=$PARALLAX_LICENSE_KEY \
  --set controlPlane.replicas=3 \
  --set persistence.enabled=true \
  --set dashboard.enabled=true
```

### Docker Compose

```yaml
version: '3.8'

services:
  control-plane:
    image: parallax/control-plane:latest
    environment:
      - PARALLAX_LICENSE_KEY=${LICENSE_KEY}
      - DATABASE_URL=postgres://parallax:pass@postgres:5432/parallax
      - REDIS_URL=redis://redis:6379
    ports:
      - "8080:8080"

  dashboard:
    image: parallax/dashboard:latest
    environment:
      - CONTROL_PLANE_URL=http://control-plane:8080
    ports:
      - "3000:3000"

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=parallax
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=parallax
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
```

## Feature Deep Dives

### Persistence

Store all execution data in PostgreSQL:

- **Execution history** — Every pattern run with inputs, outputs, and timing
- **Agent activity** — Which agents responded, their confidence scores
- **Audit trail** — Who ran what, when, for compliance
- **Metrics** — Historical performance data in TimescaleDB

[Learn more →](/enterprise/persistence)

### High Availability

Zero-downtime operation with clustering:

- **Leader election** — Automatic primary selection
- **State sync** — Redis-based state replication
- **Failover** — Automatic recovery from failures
- **Rolling updates** — Update without service interruption

[Learn more →](/enterprise/high-availability)

### Web Dashboard

Real-time monitoring and management:

- **Metrics** — Execution counts, success rates, confidence trends
- **Agent management** — View and manage connected agents
- **Execution browser** — Search and replay past executions
- **Alerts** — Configure notifications for issues

### Security

Enterprise-grade security features:

- **mTLS** — Mutual TLS for all connections
- **RBAC** — Role-based access (admin, operator, viewer)
- **SSO** — SAML/OIDC integration (Okta, Azure AD, Google)
- **Audit logs** — Compliance-ready event logging

[Learn more →](/enterprise/security)

### Multi-Region (Enterprise Plus)

Geographic distribution for global deployments:

- **Regional routing** — Route to nearest agents
- **Data residency** — Keep data in specific regions
- **Disaster recovery** — Failover between regions

[Learn more →](/enterprise/multi-region)

## Support

| Tier | Response Time | Channels |
|------|---------------|----------|
| Community | Best effort | GitHub, Discord |
| Enterprise | 8 business hours | Email, Portal |
| Enterprise Plus | 4 hours (24/7) | Email, Slack, Phone |

## Contact

- **Sales**: enterprise@parallax.ai
- **Support**: support@parallax.ai
- **Security**: security@parallax.ai
- **Website**: [parallax.ai/enterprise](https://parallax.ai/enterprise)

## Next Steps

- [High Availability](/enterprise/high-availability) — Set up clustering
- [Persistence](/enterprise/persistence) — Configure storage
- [Security](/enterprise/security) — Enable security features
- [Multi-Region](/enterprise/multi-region) — Geographic distribution
