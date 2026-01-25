---
sidebar_position: 2
title: High Availability
---

# High Availability

Deploy Parallax with multi-node clustering for automatic failover and zero-downtime operations.

## Overview

High Availability (HA) mode runs multiple control plane instances that coordinate through a shared state store. If any instance fails, others automatically take over without service interruption.

```
                    ┌─────────────────────┐
                    │   Load Balancer     │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Control Plane 1 │  │ Control Plane 2 │  │ Control Plane 3 │
│   (Primary)     │  │   (Standby)     │  │   (Standby)     │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │    Redis Cluster    │
                    │  (State + Locking)  │
                    └─────────────────────┘
```

## Components

### Control Plane Cluster

Multiple instances share state and coordinate leadership:

| Component | Role |
|-----------|------|
| **Primary** | Handles coordination, leader election, garbage collection |
| **Standbys** | Process requests, ready for failover |
| **All nodes** | Accept API requests, handle WebSocket connections |

### Redis (Required)

Redis provides:

- **State synchronization**: Share execution state across nodes
- **Leader election**: Coordinate primary selection via locks
- **Pub/Sub**: Real-time event distribution
- **Session storage**: Maintain WebSocket sessions across failover

### Load Balancer

Distributes traffic across all healthy nodes:

- Health check endpoint: `/health/ready`
- WebSocket sticky sessions: Optional but recommended
- Graceful drain: 30-second connection drain on removal

## Configuration

### Enable HA Mode

```yaml
# parallax.config.yaml
highAvailability:
  enabled: true

  # Cluster identification
  clusterId: production

  # Leader election
  leaderElection:
    enabled: true
    leaseDuration: 15s
    renewDeadline: 10s
    retryPeriod: 2s

  # Health monitoring
  memberHealth:
    checkInterval: 5s
    timeout: 3s
    unhealthyThreshold: 3

# Redis connection (required for HA)
redis:
  url: redis://redis-cluster:6379
  # Or for Redis Cluster
  cluster:
    nodes:
      - redis-1:6379
      - redis-2:6379
      - redis-3:6379
```

### Helm Values

```yaml
# values.yaml
controlPlane:
  replicas: 3

  config:
    highAvailability:
      enabled: true
      clusterId: production

  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchLabels:
              app: parallax-control-plane
          topologyKey: kubernetes.io/hostname

  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule

redis:
  enabled: true
  architecture: replication
  replica:
    replicaCount: 3
  sentinel:
    enabled: true
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PARALLAX_HA_ENABLED` | Enable HA mode | `false` |
| `PARALLAX_HA_CLUSTER_ID` | Cluster identifier | `default` |
| `PARALLAX_REDIS_URL` | Redis connection URL | - |
| `PARALLAX_HA_LEASE_DURATION` | Leader lease duration | `15s` |

## Leader Election

### How It Works

1. **Startup**: Each node attempts to acquire a Redis lock
2. **Winner**: First to acquire becomes primary
3. **Renewal**: Primary renews lock periodically
4. **Failover**: If renewal fails, other nodes compete for leadership

### Leader Responsibilities

The primary node handles:

- **Garbage collection**: Clean up expired executions
- **Agent rebalancing**: Redistribute agents across nodes
- **Metrics aggregation**: Consolidated cluster metrics
- **Background tasks**: Periodic maintenance

### Viewing Leader Status

```bash
# Via CLI
parallax ha status

# Output:
# Cluster: production
# Members: 3
# Leader: parallax-control-plane-0
#
# Node                      Status    Role      Last Seen
# parallax-control-plane-0  healthy   leader    2s ago
# parallax-control-plane-1  healthy   standby   1s ago
# parallax-control-plane-2  healthy   standby   1s ago
```

```bash
# Via API
curl http://localhost:8080/ha/status
```

```json
{
  "clusterId": "production",
  "members": [
    {
      "id": "parallax-control-plane-0",
      "address": "10.0.0.1:8080",
      "role": "leader",
      "status": "healthy",
      "lastHeartbeat": "2024-01-15T10:30:00Z"
    },
    {
      "id": "parallax-control-plane-1",
      "address": "10.0.0.2:8080",
      "role": "standby",
      "status": "healthy",
      "lastHeartbeat": "2024-01-15T10:30:01Z"
    }
  ]
}
```

## State Synchronization

### Execution State

Executions are tracked in Redis for cross-node visibility:

```
redis> HGETALL parallax:execution:exec_abc123
1) "status"
2) "running"
3) "pattern"
4) "content-classifier"
5) "startedAt"
6) "2024-01-15T10:30:00Z"
7) "nodeId"
8) "parallax-control-plane-0"
```

### Agent Sessions

WebSocket connections are tracked for session affinity:

```
redis> HGETALL parallax:agent:agent_xyz789
1) "nodeId"
2) "parallax-control-plane-1"
3) "capabilities"
4) "[\"classification\",\"analysis\"]"
5) "connectedAt"
6) "2024-01-15T10:00:00Z"
```

### Pub/Sub Events

Real-time events distributed via Redis pub/sub:

- `parallax:events:execution` - Execution state changes
- `parallax:events:agent` - Agent connect/disconnect
- `parallax:events:cluster` - Cluster membership changes

## Failover

### Automatic Failover

When a node fails:

1. **Detection**: Other nodes notice missing heartbeats (default: 15s)
2. **Election**: Remaining nodes compete for leadership
3. **Promotion**: New leader takes over coordination duties
4. **Recovery**: In-flight executions are resumed or retried

### Agent Reconnection

Agents automatically reconnect to healthy nodes:

```typescript
const agent = new ParallaxAgent({
  controlPlaneUrl: 'http://load-balancer:8080',
  reconnect: {
    enabled: true,
    maxRetries: 10,
    backoff: {
      initial: 1000,
      max: 30000,
      multiplier: 2,
    },
  },
});
```

### Execution Recovery

In-flight executions during failover:

| Execution State | Recovery Action |
|-----------------|-----------------|
| Pending | Re-queued automatically |
| Running (agents working) | Continues on agents |
| Aggregating | Resumed by new node |
| Failed | Reported as failed |

### Manual Failover

Trigger manual leader election:

```bash
# Step down current leader
parallax ha stepdown

# Force election
parallax ha elect --force
```

## Scaling

### Horizontal Scaling

Add nodes to handle more load:

```bash
# Kubernetes
kubectl scale statefulset parallax-control-plane --replicas=5

# Docker
docker compose up -d --scale control-plane=5
```

### Recommendations

| Workload | Nodes | Redis |
|----------|-------|-------|
| Development | 1 | Single |
| Small (< 100 agents) | 3 | Single |
| Medium (< 1000 agents) | 3-5 | Sentinel |
| Large (< 10000 agents) | 5-7 | Cluster |
| Very Large | 7+ | Cluster |

### Node Sizing

| Node Size | CPU | Memory | Agents | Executions/sec |
|-----------|-----|--------|--------|----------------|
| Small | 1 | 1GB | 100 | 10 |
| Medium | 2 | 2GB | 500 | 50 |
| Large | 4 | 4GB | 2000 | 200 |
| XLarge | 8 | 8GB | 5000 | 500 |

## Load Balancing

### Kubernetes Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: parallax-control-plane
spec:
  type: ClusterIP
  selector:
    app: parallax-control-plane
  ports:
    - port: 8080
      targetPort: 8080
```

### Ingress with Session Affinity

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: parallax
  annotations:
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/session-cookie-name: "PARALLAX_AFFINITY"
    nginx.ingress.kubernetes.io/session-cookie-expires: "172800"
spec:
  rules:
    - host: parallax.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: parallax-control-plane
                port:
                  number: 8080
```

### AWS ALB

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /health/ready
    alb.ingress.kubernetes.io/stickiness.enabled: "true"
    alb.ingress.kubernetes.io/stickiness.type: lb_cookie
```

## Health Checks

### Endpoints

| Endpoint | Purpose | Use For |
|----------|---------|---------|
| `/health` | Basic health | General monitoring |
| `/health/live` | Liveness | Kubernetes liveness probe |
| `/health/ready` | Readiness | Load balancer, readiness probe |

### Liveness Probe

Checks if the process is running:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
```

### Readiness Probe

Checks if the node can accept traffic:

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
```

## Monitoring

### Cluster Metrics

```prometheus
# Leader status (1 = leader, 0 = standby)
parallax_ha_is_leader{node="parallax-control-plane-0"} 1

# Cluster members
parallax_ha_cluster_members 3

# Healthy members
parallax_ha_healthy_members 3

# Leader elections
parallax_ha_elections_total 5

# State sync latency
parallax_ha_sync_latency_seconds{quantile="0.99"} 0.005
```

### Alerts

```yaml
groups:
  - name: parallax-ha
    rules:
      - alert: ParallaxNoLeader
        expr: sum(parallax_ha_is_leader) == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: No leader elected

      - alert: ParallaxSplitBrain
        expr: sum(parallax_ha_is_leader) > 1
        for: 10s
        labels:
          severity: critical
        annotations:
          summary: Multiple leaders detected

      - alert: ParallaxUnhealthyMember
        expr: parallax_ha_healthy_members < parallax_ha_cluster_members
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: Cluster member unhealthy
```

## Troubleshooting

### No Leader Elected

**Symptoms**: Cluster has no leader, coordination tasks not running

**Check**:
```bash
parallax ha status
redis-cli GET parallax:ha:leader
```

**Causes**:
- Redis connection issues
- Network partition
- All nodes unhealthy

**Fix**:
1. Check Redis connectivity
2. Verify network between nodes
3. Restart unhealthy nodes

### Split Brain

**Symptoms**: Multiple nodes think they're leader

**Check**:
```bash
parallax ha status
# Shows multiple leaders
```

**Causes**:
- Network partition
- Redis cluster issues
- Clock skew

**Fix**:
1. Check network connectivity
2. Verify Redis cluster health
3. Force election: `parallax ha elect --force`

### State Sync Lag

**Symptoms**: Executions appear on wrong node, stale data

**Check**:
```prometheus
parallax_ha_sync_latency_seconds{quantile="0.99"} > 1
```

**Causes**:
- Redis overloaded
- Network latency
- High execution volume

**Fix**:
1. Scale Redis
2. Check network latency
3. Increase sync batch size

## Best Practices

1. **Always use 3+ nodes** - Allows for one failure while maintaining quorum

2. **Spread across zones** - Use topology constraints to survive zone failures

3. **Monitor cluster health** - Set up alerts for leader elections and member health

4. **Use Redis Sentinel/Cluster** - Match Redis HA to control plane HA

5. **Test failover regularly** - Practice chaos engineering

6. **Set appropriate timeouts** - Balance between fast failover and stability

## Next Steps

- [Persistence](/enterprise/persistence) - Durable storage
- [Multi-Region](/enterprise/multi-region) - Geographic distribution
- [Security](/enterprise/security) - Secure the cluster
