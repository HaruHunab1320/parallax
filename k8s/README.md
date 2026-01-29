# Parallax Kubernetes Deployment

Helm chart for deploying the Parallax control plane to Kubernetes.

## Directory Structure

```
k8s/
└── helm/parallax/       # Helm chart for full stack deployment
```

## Prerequisites

- Kubernetes 1.26+
- kubectl configured to access your cluster
- Helm 3+
- cert-manager (optional, for TLS)

## Quick Start

```bash
# Install from local chart
helm install parallax ./k8s/helm/parallax \
  --namespace parallax-system \
  --create-namespace

# Install with custom values
helm install parallax ./k8s/helm/parallax \
  --namespace parallax-system \
  --create-namespace \
  --values my-values.yaml
```

## What Gets Deployed

The Helm chart deploys:

- **Control Plane** - Core Parallax orchestration service
- **etcd** - Distributed key-value store for agent registry
- **PostgreSQL** - Database for patterns, executions, and metrics
- **Redis** - Caching and pub/sub
- **InfluxDB** - Time-series metrics storage
- **Grafana** - Dashboards and visualization
- **Prometheus** - Metrics collection

## Configuration

### Key Helm Values

```yaml
# Control Plane
controlPlane:
  enabled: true
  replicaCount: 1
  licenseKey: ""  # Enterprise license (optional)
  resources:
    requests:
      cpu: 200m
      memory: 256Mi

# Database
postgresql:
  enabled: true
  auth:
    username: parallax
    password: changeme  # Change in production!
    database: parallax

# Monitoring
grafana:
  enabled: true
  adminPassword: changeme  # Change in production!

influxdb:
  enabled: true
  persistence:
    size: 10Gi

# Security
security:
  tls:
    enabled: false
    certManager:
      enabled: false
```

### Environment-specific Values

```bash
# Development
helm install parallax ./k8s/helm/parallax \
  -f ./k8s/helm/parallax/values-dev.yaml

# Production
helm install parallax ./k8s/helm/parallax \
  -f ./k8s/helm/parallax/values-production.yaml
```

## Monitoring

### Access Grafana

```bash
# Port-forward Grafana
kubectl port-forward -n parallax-system \
  svc/parallax-grafana 3000:80

# Access at http://localhost:3000
# Default: admin / parallax123
```

### Access Prometheus Metrics

```bash
kubectl port-forward -n parallax-system \
  svc/parallax-control-plane 3001:3001

curl http://localhost:3001/metrics
```

## Scaling

### Enable Horizontal Pod Autoscaling

```yaml
controlPlane:
  autoscaling:
    enabled: true
    minReplicas: 1
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80
```

## Security

### Network Policies

```yaml
networkPolicy:
  enabled: true
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: parallax-system
```

### TLS

```yaml
security:
  tls:
    enabled: true
    certManager:
      enabled: true
      issuer: letsencrypt-prod
```

## Agent Runtimes

The control plane supports multiple agent runtimes:

| Runtime | Description |
|---------|-------------|
| `local` | Agents run as local processes (default) |
| `docker` | Agents run as Docker containers |
| `kubernetes` | Agents run as K8s pods via `runtime-k8s` |

To use the Kubernetes runtime for agents, configure:

```yaml
controlPlane:
  env:
    PARALLAX_RUNTIME: kubernetes
    PARALLAX_K8S_NAMESPACE: parallax-agents
```

The `runtime-k8s` package (`/packages/runtime-k8s`) handles spawning agents as Kubernetes pods.

## Troubleshooting

### Check Control Plane Logs

```bash
kubectl logs -n parallax-system deployment/parallax-control-plane
```

### Check Pod Status

```bash
kubectl get pods -n parallax-system
kubectl describe pod <pod-name> -n parallax-system
```

### Common Issues

1. **Control plane not starting**
   - Check database connectivity
   - Verify etcd is running
   - Review resource limits

2. **Metrics not available**
   - Ensure Prometheus is running
   - Check service monitor configuration

3. **Database connection errors**
   - Verify PostgreSQL credentials
   - Check network policies

## Upgrade

```bash
helm upgrade parallax ./k8s/helm/parallax \
  --namespace parallax-system \
  --values my-values.yaml
```

## Uninstall

```bash
helm uninstall parallax --namespace parallax-system

# Optional: delete namespace
kubectl delete namespace parallax-system
```
