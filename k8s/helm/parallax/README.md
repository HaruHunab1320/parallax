# Parallax Helm Chart

This Helm chart deploys the Parallax AI Orchestration Platform on Kubernetes.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.8+
- PV provisioner support in the underlying infrastructure (for persistence)
- [Optional] Prometheus Operator for metrics collection

## Installation

### Add Helm Repository

```bash
helm repo add parallax https://charts.parallax.io
helm repo update
```

### Install Chart

```bash
# Install with default configuration
helm install my-parallax parallax/parallax

# Install in a specific namespace
helm install my-parallax parallax/parallax -n parallax-system --create-namespace

# Install with custom values
helm install my-parallax parallax/parallax -f my-values.yaml
```

## Configuration

See [values.yaml](values.yaml) for full configuration options.

### Key Configuration Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `controlPlane.enabled` | Enable control plane deployment | `true` |
| `controlPlane.replicaCount` | Number of control plane replicas | `1` |
| `controlPlane.image.repository` | Control plane image repository | `parallax/control-plane` |
| `controlPlane.image.tag` | Control plane image tag | `latest` |
| `operator.enabled` | Enable operator deployment | `true` |
| `etcd.enabled` | Deploy etcd for service registry | `true` |
| `postgresql.enabled` | Deploy PostgreSQL for persistence | `true` |
| `monitoring.prometheus.enabled` | Enable Prometheus metrics | `true` |
| `ingress.enabled` | Enable ingress | `false` |

### Common Configurations

#### Production Deployment

```yaml
# values-production.yaml
controlPlane:
  replicaCount: 3
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 2000m
      memory: 4Gi
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
  podDisruptionBudget:
    enabled: true
    minAvailable: 2

postgresql:
  persistence:
    size: 100Gi
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi

etcd:
  persistence:
    size: 50Gi

monitoring:
  prometheus:
    serviceMonitor:
      enabled: true

networkPolicy:
  enabled: true
```

#### Development Deployment

```yaml
# values-dev.yaml
controlPlane:
  replicaCount: 1
  resources:
    requests:
      cpu: 100m
      memory: 256Mi

postgresql:
  persistence:
    enabled: false

etcd:
  persistence:
    enabled: false

ingress:
  enabled: true
  hosts:
    - host: parallax.local
      paths:
        - path: /
```

#### With External Database

```yaml
# values-external-db.yaml
postgresql:
  enabled: false

controlPlane:
  database:
    url: "postgresql://user:password@external-db:5432/parallax"
```

### Authentication

To enable authentication:

```yaml
controlPlane:
  auth:
    enabled: true
    jwt:
      secret: "your-secret-key"  # Use a secure secret in production
      expiry: "24h"
    rbac:
      enabled: true
```

### Monitoring Integration

The chart includes ServiceMonitor resources for Prometheus Operator:

```yaml
monitoring:
  prometheus:
    serviceMonitor:
      enabled: true
      namespace: monitoring  # Prometheus namespace
      interval: 30s
```

### Pattern Management

Deploy with custom patterns:

```yaml
controlPlane:
  patterns:
    defaultPatterns:
      consensus.prism: |
        pattern consensus {
          agents { min = 3 }
          // Pattern definition
        }
      analysis.prism: |
        pattern analysis {
          // Pattern definition
        }
```

## Upgrading

```bash
# Upgrade to a new version
helm upgrade my-parallax parallax/parallax

# Upgrade with new values
helm upgrade my-parallax parallax/parallax -f my-values.yaml
```

## Uninstallation

```bash
# Uninstall the release
helm uninstall my-parallax

# Uninstall and delete PVCs
helm uninstall my-parallax
kubectl delete pvc -l app.kubernetes.io/instance=my-parallax
```

## Persistence

The chart creates PersistentVolumeClaims for:
- etcd data (if enabled)
- PostgreSQL data (if enabled)
- Pattern storage (if persistence enabled)

To backup data:

```bash
# Backup PostgreSQL
kubectl exec -it my-parallax-postgresql-0 -- pg_dump -U parallax parallax > backup.sql

# Backup etcd
kubectl exec -it my-parallax-etcd-0 -- etcdctl snapshot save /tmp/snapshot.db
kubectl cp my-parallax-etcd-0:/tmp/snapshot.db ./etcd-snapshot.db
```

## Troubleshooting

### Check pod status
```bash
kubectl get pods -l app.kubernetes.io/instance=my-parallax
```

### View logs
```bash
# Control plane logs
kubectl logs -l app.kubernetes.io/component=control-plane

# Operator logs
kubectl logs -l app.kubernetes.io/component=operator
```

### Test connectivity
```bash
# Port forward to control plane
kubectl port-forward svc/my-parallax-control-plane 8080:8080

# Test API
curl http://localhost:8080/health
```

### Common Issues

1. **Pods stuck in Pending state**
   - Check PVC status: `kubectl get pvc`
   - Ensure storage class exists: `kubectl get storageclass`

2. **Authentication errors**
   - Verify JWT secret is set
   - Check auth configuration in values

3. **Pattern execution failures**
   - Check operator logs
   - Verify agent deployments
   - Check etcd connectivity

## Development

### Running locally with Minikube

```bash
# Start Minikube
minikube start --memory=8192 --cpus=4

# Install the chart
helm install parallax ./k8s/helm/parallax \
  --set controlPlane.image.pullPolicy=IfNotPresent \
  --set operator.image.pullPolicy=IfNotPresent

# Access the service
minikube service parallax-control-plane
```

### Building custom images

```bash
# Build and push control plane
docker build -t myregistry/control-plane:custom .
docker push myregistry/control-plane:custom

# Install with custom image
helm install parallax ./k8s/helm/parallax \
  --set controlPlane.image.repository=myregistry/control-plane \
  --set controlPlane.image.tag=custom
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/parallax/parallax/issues
- Documentation: https://docs.parallax.io
- Slack: https://parallax-community.slack.com