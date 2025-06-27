# Parallax Kubernetes Deployment

This directory contains Kubernetes manifests, operators, and Helm charts for deploying the Parallax platform on Kubernetes.

## Directory Structure

```
k8s/
├── crds/                  # Custom Resource Definitions
├── operators/             # Kubernetes Operator
├── examples/              # Example manifests
└── helm/                  # Helm chart
```

## Prerequisites

- Kubernetes 1.26+
- kubectl configured to access your cluster
- Helm 3+ (for Helm installation)
- cert-manager (optional, for TLS)

## Quick Start

### Option 1: Using Helm (Recommended)

```bash
# Add the Parallax Helm repository (when published)
# helm repo add parallax https://charts.parallax.io
# helm repo update

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

### Option 2: Using kubectl

```bash
# Install CRDs
kubectl apply -f k8s/crds/

# Install the operator
kubectl apply -f k8s/operators/parallax-operator/deploy/

# Wait for operator to be ready
kubectl wait --for=condition=available --timeout=300s \
  deployment/parallax-operator -n parallax-system

# Deploy example agents and patterns
kubectl apply -f k8s/examples/
```

## Custom Resource Definitions (CRDs)

### ParallaxAgent

Defines an AI agent that can be deployed and managed by the platform.

```yaml
apiVersion: agent.parallax.io/v1alpha1
kind: ParallaxAgent
metadata:
  name: sentiment-analyzer
spec:
  agentId: sentiment-1
  image: parallax/sentiment-agent:latest
  replicas: 2
  capabilities:
    - sentiment
    - emotion
  autoscaling:
    enabled: true
    targetConfidenceThreshold: 0.85
```

### Pattern

Defines a coordination pattern written in Prism.

```yaml
apiVersion: pattern.parallax.io/v1alpha1
kind: Pattern
metadata:
  name: consensus-builder
spec:
  name: consensus-builder
  source:
    type: inline
    content: |
      pattern consensus_builder {
        agents~: select(capability: "analysis", min: 3)
        results~: parallel(agents~, analyze, input)
        consensus~>: aggregate(results~, weighted_vote)
        return consensus~
      }
  minAgents: 3
  confidenceThreshold: 0.7
```

### PatternExecution

Triggers execution of a pattern with specific input.

```yaml
apiVersion: execution.parallax.io/v1alpha1
kind: PatternExecution
metadata:
  name: analyze-text-001
spec:
  patternRef:
    name: consensus-builder
  input:
    text: "Analyze this text"
  successPolicy:
    minConfidence: 0.8
```

## Configuration

### Helm Values

Key configuration options in `values.yaml`:

```yaml
# Control Plane
controlPlane:
  enabled: true
  replicaCount: 1
  resources:
    requests:
      cpu: 200m
      memory: 256Mi

# Monitoring
influxdb:
  enabled: true
  persistence:
    size: 10Gi

grafana:
  enabled: true
  adminPassword: changeme

# Security
security:
  tls:
    enabled: true
    certManager:
      enabled: true
```

### Environment Variables

Control plane configuration via environment:

- `PARALLAX_ETCD_ENDPOINTS` - etcd cluster endpoints
- `PARALLAX_CONFIDENCE_STORE` - "memory" or "influxdb"
- `INFLUXDB_URL` - InfluxDB URL (when using InfluxDB)
- `INFLUXDB_TOKEN` - InfluxDB auth token

## Monitoring

### Prometheus Metrics

The platform exposes Prometheus metrics on `/metrics`:

```bash
# Port-forward to access metrics
kubectl port-forward -n parallax-system \
  svc/parallax-control-plane 3001:3001

# View metrics
curl http://localhost:3001/metrics
```

### Grafana Dashboards

Access Grafana dashboards:

```bash
# Port-forward Grafana
kubectl port-forward -n parallax-system \
  svc/parallax-grafana 3000:80

# Access at http://localhost:3000
# Default: admin / parallax123
```

## Scaling

### Horizontal Pod Autoscaling

Agents support HPA based on CPU and confidence metrics:

```yaml
spec:
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
    targetConfidenceThreshold: 0.85
```

### Manual Scaling

```bash
# Scale an agent
kubectl scale parallaxagent sentiment-analyzer --replicas=5
```

## Security

### RBAC

The operator requires cluster-wide permissions to manage resources. Review and adjust RBAC as needed:

```bash
kubectl describe clusterrole parallax-operator
```

### Network Policies

Enable network policies in Helm values:

```yaml
networkPolicy:
  enabled: true
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: parallax-system
```

### TLS/mTLS

Enable TLS for agent communication:

```yaml
security:
  tls:
    enabled: true
    certManager:
      enabled: true
      issuer: letsencrypt-prod
```

## Troubleshooting

### Check Operator Logs

```bash
kubectl logs -n parallax-system deployment/parallax-operator
```

### Check Agent Status

```bash
# List all agents
kubectl get parallaxagents

# Describe specific agent
kubectl describe parallaxagent sentiment-analyzer
```

### Check Pattern Executions

```bash
# List executions
kubectl get patternexecutions

# View execution details
kubectl describe patternexecution analyze-text-001
```

### Common Issues

1. **Agents not registering**
   - Check etcd connectivity
   - Verify service discovery configuration
   - Check agent logs: `kubectl logs deployment/<agent-name>`

2. **Pattern execution failing**
   - Verify required capabilities are available
   - Check confidence thresholds
   - Review pattern syntax

3. **Metrics not available**
   - Ensure Prometheus is running
   - Check service monitor configuration
   - Verify metrics endpoint is accessible

## Advanced Topics

### Multi-Region Deployment

Deploy control planes in multiple regions:

```yaml
# region-1-values.yaml
controlPlane:
  env:
    REGION: us-west-2
    FEDERATION_ENABLED: true
```

### Custom Operators

Extend the operator with custom controllers:

```go
// Add to main.go
if err = (&mycontroller.Reconciler{
    Client: mgr.GetClient(),
    Scheme: mgr.GetScheme(),
}).SetupWithManager(mgr); err != nil {
    setupLog.Error(err, "unable to create controller")
    os.Exit(1)
}
```

### GitOps Integration

Use Flux or ArgoCD for GitOps:

```yaml
# flux-kustomization.yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: parallax
spec:
  interval: 10m
  path: ./k8s
  prune: true
  sourceRef:
    kind: GitRepository
    name: parallax
```

## Development

### Building the Operator

```bash
cd k8s/operators/parallax-operator
make build
make docker-build docker-push IMG=parallax/operator:dev
```

### Testing CRDs

```bash
# Validate CRDs
kubectl apply --dry-run=client -f k8s/crds/

# Test with examples
kubectl apply -f k8s/examples/ --dry-run=client
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.