# @parallax/k8s-deployment

Kubernetes deployment resources for the Parallax AI orchestration platform.

## Overview

This package contains all Kubernetes resources needed to deploy Parallax:
- Helm charts for easy deployment
- Custom Resource Definitions (CRDs)
- Kubernetes operators
- Example configurations

## Quick Start

### Using Helm

```bash
# Add Parallax Helm repository
helm repo add parallax https://charts.parallax.ai
helm repo update

# Install Parallax (Open Source)
helm install parallax parallax/parallax \
  --namespace parallax-system \
  --create-namespace

# Install Parallax (Enterprise)
helm install parallax parallax/parallax \
  --namespace parallax-system \
  --create-namespace \
  --set license.key=$PARALLAX_LICENSE_KEY \
  --set enterprise.enabled=true
```

### Using kubectl

```bash
# Apply CRDs
kubectl apply -f crds/

# Deploy control plane
kubectl apply -f examples/control-plane.yaml

# Deploy sample agents
kubectl apply -f examples/sample-agents.yaml
```

## Helm Chart Structure

```
helm/parallax/
├── Chart.yaml          # Chart metadata
├── values.yaml         # Default values
├── templates/
│   ├── control-plane/  # Control plane resources
│   ├── data-plane/     # Data plane resources
│   ├── etcd/           # etcd cluster
│   ├── monitoring/     # Prometheus ServiceMonitor
│   └── rbac/           # RBAC resources
└── crds/               # Custom Resource Definitions
```

## Custom Resources

### Pattern CRD
```yaml
apiVersion: parallax.ai/v1alpha1
kind: Pattern
metadata:
  name: consensus-builder
spec:
  description: "Multi-agent consensus pattern"
  minAgents: 3
  maxAgents: 10
  confidence:
    threshold: 0.7
  source:
    type: inline
    prism: |
      pattern consensus_builder {
        // Pattern logic
      }
```

### AgentPool CRD
```yaml
apiVersion: parallax.ai/v1alpha1
kind: AgentPool
metadata:
  name: ml-agents
spec:
  replicas: 5
  selector:
    capabilities:
    - machine-learning
    - data-analysis
  template:
    spec:
      image: parallax/ml-agent:latest
      resources:
        requests:
          memory: "2Gi"
          cpu: "1"
```

## Deployment Modes

### Development Mode
```yaml
# values-dev.yaml
controlPlane:
  replicas: 1
  persistence:
    enabled: false
etcd:
  replicas: 1
  persistence:
    enabled: false
```

### Production Mode
```yaml
# values-prod.yaml
controlPlane:
  replicas: 3
  persistence:
    enabled: true
    storageClass: fast-ssd
etcd:
  replicas: 3
  persistence:
    enabled: true
    size: 10Gi
monitoring:
  enabled: true
security:
  tls:
    enabled: true
```

## Operators

### Parallax Operator

Manages Parallax deployments and lifecycle:
```bash
# Deploy operator
kubectl apply -f operators/parallax-operator/deploy/

# Create Parallax instance
kubectl apply -f - <<EOF
apiVersion: parallax.ai/v1alpha1
kind: Parallax
metadata:
  name: parallax-prod
spec:
  version: latest
  license:
    secretRef: parallax-license
  controlPlane:
    replicas: 3
  agents:
    pools:
    - name: general
      replicas: 10
    - name: ml-specialized
      replicas: 5
EOF
```

## Security

### Network Policies
```yaml
# Restrict agent communication
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: agent-isolation
spec:
  podSelector:
    matchLabels:
      component: agent
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          component: control-plane
```

### Pod Security
- Non-root containers
- Read-only root filesystem
- Dropped capabilities
- Security contexts enforced

## Monitoring

### Prometheus Integration
```yaml
# ServiceMonitor for metrics
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: parallax-metrics
spec:
  selector:
    matchLabels:
      app: parallax
  endpoints:
  - port: metrics
    interval: 30s
```

### Grafana Dashboards
Import from `@parallax/monitoring` package.

## Scaling

### Horizontal Pod Autoscaling
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: parallax-agents
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: parallax-agent-pool
  minReplicas: 3
  maxReplicas: 100
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Troubleshooting

```bash
# Check operator logs
kubectl logs -n parallax-system deployment/parallax-operator

# View Parallax resources
kubectl get patterns,agentpools,parallax -A

# Debug agent registration
kubectl exec -it deployment/parallax-control-plane -- parallax-cli agent list
```