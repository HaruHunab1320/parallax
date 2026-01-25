---
sidebar_position: 1
title: Overview
---

# Enterprise Features

Parallax Enterprise adds production-grade capabilities for teams and organizations running multi-agent orchestration at scale.

## What's Included

| Feature | Description |
|---------|-------------|
| **High Availability** | Multi-node clustering with automatic failover |
| **Persistence** | Durable storage for patterns and execution history |
| **Multi-Region** | Distribute agents across geographic regions |
| **Security** | mTLS, RBAC, SSO integration, audit logging |
| **Kubernetes Operator** | Native K8s deployment and scaling |
| **Priority Support** | Dedicated support channel and SLAs |

## Open Source vs Enterprise

| Feature | Open Source | Enterprise |
|---------|-------------|------------|
| Core orchestration | ✓ | ✓ |
| Voting/Consensus patterns | ✓ | ✓ |
| TypeScript SDK | ✓ | ✓ |
| REST/WebSocket API | ✓ | ✓ |
| Pattern Builder | ✓ | ✓ |
| Single-node deployment | ✓ | ✓ |
| Basic authentication | ✓ | ✓ |
| Multi-node clustering | - | ✓ |
| Automatic failover | - | ✓ |
| Persistent storage | - | ✓ |
| Multi-region support | - | ✓ |
| mTLS encryption | - | ✓ |
| RBAC | - | ✓ |
| SSO integration | - | ✓ |
| Audit logging | - | ✓ |
| Kubernetes Operator | - | ✓ |
| Priority support | - | ✓ |

## Architecture Overview

```
                          ┌─────────────────────────────────────────────┐
                          │              Load Balancer                   │
                          └─────────────────────┬───────────────────────┘
                                                │
              ┌─────────────────────────────────┼─────────────────────────────────┐
              │                                 │                                 │
              ▼                                 ▼                                 ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│    Control Plane 1      │   │    Control Plane 2      │   │    Control Plane 3      │
│    (Primary)            │   │    (Replica)            │   │    (Replica)            │
└───────────┬─────────────┘   └───────────┬─────────────┘   └───────────┬─────────────┘
            │                             │                             │
            └─────────────────────────────┼─────────────────────────────┘
                                          │
                                          ▼
                          ┌─────────────────────────────────┐
                          │         Redis Cluster           │
                          │   (State synchronization)       │
                          └─────────────────────────────────┘
                                          │
                                          ▼
                          ┌─────────────────────────────────┐
                          │       PostgreSQL Cluster        │
                          │   (Persistent storage)          │
                          └─────────────────────────────────┘
```

## Getting Started

### 1. Contact Sales

Request an enterprise license:

- Email: enterprise@parallax.dev
- Web: [parallax.dev/enterprise](https://parallax.dev/enterprise)

### 2. Install Enterprise Components

```bash
# Add enterprise Helm repository
helm repo add parallax-enterprise https://enterprise.charts.parallax.dev
helm repo update

# Install with enterprise license
helm install parallax parallax-enterprise/parallax \
  --namespace parallax \
  --create-namespace \
  --set license.key=$PARALLAX_LICENSE_KEY
```

### 3. Configure High Availability

```yaml
# values.yaml
controlPlane:
  replicas: 3

redis:
  enabled: true
  cluster:
    enabled: true
    replicas: 6

postgresql:
  enabled: true
  replication:
    enabled: true
    readReplicas: 2
```

### 4. Enable Security Features

```yaml
security:
  mtls:
    enabled: true

  rbac:
    enabled: true

  sso:
    enabled: true
    provider: okta
    issuer: https://your-org.okta.com
    clientId: ${OKTA_CLIENT_ID}
    clientSecret: ${OKTA_CLIENT_SECRET}

  audit:
    enabled: true
    destination: elasticsearch
```

## Feature Details

### High Availability

Run multiple control plane instances with automatic failover:

- **Leader election**: Automatic primary selection
- **State replication**: Via Redis Cluster
- **Session affinity**: WebSocket connections maintained during failover
- **Zero downtime**: Rolling updates without service interruption

[Learn more →](/enterprise/high-availability)

### Persistence

Store patterns, executions, and audit logs durably:

- **PostgreSQL**: ACID-compliant storage
- **Execution history**: Full replay capability
- **Pattern versioning**: Complete version history
- **Backup/restore**: Point-in-time recovery

[Learn more →](/enterprise/persistence)

### Multi-Region

Deploy agents across geographic regions:

- **Region-aware routing**: Route to nearest agents
- **Latency optimization**: Minimize cross-region calls
- **Compliance**: Data residency requirements
- **Disaster recovery**: Region failover

[Learn more →](/enterprise/multi-region)

### Security

Enterprise-grade security features:

- **mTLS**: Mutual TLS for all connections
- **RBAC**: Role-based access control
- **SSO**: SAML/OIDC integration
- **Audit logging**: Compliance-ready logging

[Learn more →](/enterprise/security)

## Deployment Options

### Kubernetes (Recommended)

Full-featured deployment with the Parallax Operator:

```bash
# Install the operator
helm install parallax-operator parallax-enterprise/operator \
  --namespace parallax-system \
  --create-namespace

# Create a Parallax cluster
kubectl apply -f - <<EOF
apiVersion: parallax.dev/v1
kind: ParallaxCluster
metadata:
  name: production
spec:
  replicas: 3
  enterprise:
    license:
      secretRef:
        name: parallax-license
    highAvailability: true
    persistence:
      enabled: true
    security:
      mtls: true
      rbac: true
EOF
```

### Docker Compose (Development)

Simplified setup for development/testing:

```yaml
version: '3.8'

services:
  control-plane:
    image: parallax/control-plane-enterprise:latest
    environment:
      - PARALLAX_LICENSE_KEY=${LICENSE_KEY}
      - PARALLAX_HA_ENABLED=true
      - PARALLAX_REDIS_URL=redis://redis:6379
      - PARALLAX_DATABASE_URL=postgres://parallax:pass@postgres:5432/parallax
    deploy:
      replicas: 3

  redis:
    image: redis:7-alpine

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=parallax
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=parallax
```

## Monitoring & Observability

### Built-in Metrics

Prometheus-compatible metrics endpoint:

```bash
curl http://localhost:8080/metrics
```

Key metrics:
- `parallax_executions_total` - Total executions
- `parallax_execution_duration_seconds` - Execution latency
- `parallax_agents_connected` - Connected agents
- `parallax_ha_leader` - Current leader status
- `parallax_storage_operations_total` - Storage operations

### Grafana Dashboards

Pre-built dashboards included:

- **Overview**: System health and throughput
- **Executions**: Pattern execution metrics
- **Agents**: Agent pool status
- **HA Status**: Cluster health
- **Security**: Auth and audit events

### Alerting

Pre-configured alert rules:

- High error rate
- No agents connected
- Leader election issues
- Storage connection failures
- Certificate expiration

## Migration Guide

### From Open Source

Migrate existing deployments to Enterprise:

1. **Backup data** (if using file storage):
   ```bash
   parallax backup create --output backup.tar.gz
   ```

2. **Update Helm repository**:
   ```bash
   helm repo add parallax-enterprise https://enterprise.charts.parallax.dev
   ```

3. **Upgrade with enterprise values**:
   ```bash
   helm upgrade parallax parallax-enterprise/parallax \
     --set license.key=$LICENSE_KEY \
     --set migration.importBackup=backup.tar.gz
   ```

4. **Verify migration**:
   ```bash
   parallax status --enterprise
   ```

## Support

### Documentation

- Technical documentation: docs.parallax.dev
- API reference: api.parallax.dev
- Knowledge base: support.parallax.dev

### Support Channels

| Tier | Response Time | Channels |
|------|---------------|----------|
| Standard | 24 hours | Email, Portal |
| Premium | 4 hours | Email, Portal, Slack |
| Critical | 1 hour | Phone, Slack, 24/7 |

### Contact

- Enterprise sales: enterprise@parallax.dev
- Technical support: support@parallax.dev
- Security issues: security@parallax.dev

## Pricing

Contact us for enterprise pricing tailored to your needs:

- **By usage**: Based on execution volume
- **By agents**: Based on connected agents
- **Unlimited**: Flat rate for unlimited usage

Email: enterprise@parallax.dev

## Next Steps

- [High Availability](/enterprise/high-availability) - Set up clustering
- [Persistence](/enterprise/persistence) - Configure storage
- [Multi-Region](/enterprise/multi-region) - Geographic distribution
- [Security](/enterprise/security) - Enable security features
