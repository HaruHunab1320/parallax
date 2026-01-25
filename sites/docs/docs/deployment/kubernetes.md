---
sidebar_position: 3
title: Kubernetes
---

# Kubernetes Deployment

Deploy Parallax on Kubernetes for production-grade scalability and reliability.

## Prerequisites

- Kubernetes cluster (1.24+)
- `kubectl` configured
- Helm 3 (optional, recommended)

## Quick Start with Helm

### Add the Helm Repository

```bash
helm repo add parallax https://charts.parallax.dev
helm repo update
```

### Install Parallax

```bash
helm install parallax parallax/parallax \
  --namespace parallax \
  --create-namespace
```

### Verify Installation

```bash
kubectl get pods -n parallax
```

Expected output:

```
NAME                             READY   STATUS    RESTARTS   AGE
parallax-control-plane-0         1/1     Running   0          2m
parallax-control-plane-1         1/1     Running   0          2m
parallax-control-plane-2         1/1     Running   0          2m
parallax-redis-0                 1/1     Running   0          2m
```

## Helm Configuration

### Basic Values

Create `values.yaml`:

```yaml
controlPlane:
  replicas: 3

  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 2000m
      memory: 2Gi

  config:
    logLevel: info
    maxAgents: 1000
    executionTimeout: 30000

redis:
  enabled: true
  replicas: 3

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: parallax.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: parallax-tls
      hosts:
        - parallax.example.com
```

Install with values:

```bash
helm install parallax parallax/parallax \
  --namespace parallax \
  --create-namespace \
  -f values.yaml
```

### Production Values

```yaml
controlPlane:
  replicas: 3

  resources:
    requests:
      cpu: 1000m
      memory: 1Gi
    limits:
      cpu: 4000m
      memory: 4Gi

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
      labelSelector:
        matchLabels:
          app: parallax-control-plane

  config:
    logLevel: info
    logFormat: json
    maxAgents: 5000
    executionTimeout: 60000

redis:
  enabled: true
  replicas: 3
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 2Gi
  persistence:
    enabled: true
    size: 10Gi
    storageClass: fast-ssd

persistence:
  enabled: true
  size: 50Gi
  storageClass: fast-ssd

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
  hosts:
    - host: parallax.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: parallax-tls
      hosts:
        - parallax.example.com

monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
  prometheusRule:
    enabled: true

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

## Manual Kubernetes Manifests

### Namespace

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: parallax
  labels:
    app.kubernetes.io/name: parallax
```

### ConfigMap

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: parallax-config
  namespace: parallax
data:
  config.yaml: |
    server:
      port: 8080
      host: 0.0.0.0

    logging:
      level: info
      format: json

    execution:
      defaultTimeout: 30000
      maxConcurrentExecutions: 100

    agents:
      maxConnections: 1000
      heartbeatInterval: 10000
```

### StatefulSet (Control Plane)

```yaml
# statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: parallax-control-plane
  namespace: parallax
spec:
  serviceName: parallax-control-plane
  replicas: 3
  selector:
    matchLabels:
      app: parallax-control-plane
  template:
    metadata:
      labels:
        app: parallax-control-plane
    spec:
      containers:
        - name: control-plane
          image: parallax/control-plane:latest
          ports:
            - containerPort: 8080
              name: http
          env:
            - name: PARALLAX_CONFIG
              value: /etc/parallax/config.yaml
            - name: PARALLAX_REDIS_URL
              value: redis://parallax-redis:6379
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
          volumeMounts:
            - name: config
              mountPath: /etc/parallax
            - name: data
              mountPath: /data
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 2000m
              memory: 2Gi
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: config
          configMap:
            name: parallax-config
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 10Gi
```

### Service

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: parallax-control-plane
  namespace: parallax
spec:
  type: ClusterIP
  selector:
    app: parallax-control-plane
  ports:
    - port: 8080
      targetPort: 8080
      name: http
---
apiVersion: v1
kind: Service
metadata:
  name: parallax-control-plane-headless
  namespace: parallax
spec:
  type: ClusterIP
  clusterIP: None
  selector:
    app: parallax-control-plane
  ports:
    - port: 8080
      targetPort: 8080
      name: http
```

### Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: parallax
  namespace: parallax
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - parallax.example.com
      secretName: parallax-tls
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

### Horizontal Pod Autoscaler

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: parallax-control-plane
  namespace: parallax
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: StatefulSet
    name: parallax-control-plane
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### PodDisruptionBudget

```yaml
# pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: parallax-control-plane
  namespace: parallax
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: parallax-control-plane
```

## Agent Deployment

### Deployment (Agents)

```yaml
# agent-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: parallax-agent-classification
  namespace: parallax
spec:
  replicas: 5
  selector:
    matchLabels:
      app: parallax-agent
      capability: classification
  template:
    metadata:
      labels:
        app: parallax-agent
        capability: classification
    spec:
      containers:
        - name: agent
          image: parallax/agent:latest
          env:
            - name: PARALLAX_CONTROL_PLANE_URL
              value: http://parallax-control-plane:8080
            - name: AGENT_CAPABILITIES
              value: classification
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: parallax-secrets
                  key: openai-api-key
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 1Gi
```

### Secrets

```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: parallax-secrets
  namespace: parallax
type: Opaque
stringData:
  openai-api-key: "sk-..."
```

Create secret from command line:

```bash
kubectl create secret generic parallax-secrets \
  --namespace parallax \
  --from-literal=openai-api-key="sk-..."
```

## Redis Deployment

### StatefulSet (Redis)

```yaml
# redis-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: parallax-redis
  namespace: parallax
spec:
  serviceName: parallax-redis
  replicas: 3
  selector:
    matchLabels:
      app: parallax-redis
  template:
    metadata:
      labels:
        app: parallax-redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          command:
            - redis-server
            - --appendonly
            - "yes"
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 2Gi
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 10Gi
---
apiVersion: v1
kind: Service
metadata:
  name: parallax-redis
  namespace: parallax
spec:
  type: ClusterIP
  selector:
    app: parallax-redis
  ports:
    - port: 6379
      targetPort: 6379
```

## Monitoring

### ServiceMonitor (Prometheus)

```yaml
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: parallax
  namespace: parallax
spec:
  selector:
    matchLabels:
      app: parallax-control-plane
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

### PrometheusRule (Alerts)

```yaml
# prometheusrule.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: parallax
  namespace: parallax
spec:
  groups:
    - name: parallax
      rules:
        - alert: ParallaxHighErrorRate
          expr: |
            rate(parallax_execution_errors_total[5m])
            / rate(parallax_execution_total[5m]) > 0.1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: High execution error rate
            description: Error rate is above 10%

        - alert: ParallaxNoAgentsConnected
          expr: parallax_agents_connected == 0
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: No agents connected
            description: No agents are connected to the control plane

        - alert: ParallaxHighLatency
          expr: |
            histogram_quantile(0.95,
              rate(parallax_execution_duration_seconds_bucket[5m])
            ) > 30
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: High execution latency
            description: P95 latency is above 30 seconds
```

### Grafana Dashboard

Import the Parallax dashboard:

```bash
kubectl apply -f https://parallax.dev/grafana-dashboard.yaml
```

## Network Policies

### Restrict Traffic

```yaml
# networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: parallax-control-plane
  namespace: parallax
spec:
  podSelector:
    matchLabels:
      app: parallax-control-plane
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow from ingress controller
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - port: 8080
    # Allow from agents
    - from:
        - podSelector:
            matchLabels:
              app: parallax-agent
      ports:
        - port: 8080
    # Allow from other control plane pods
    - from:
        - podSelector:
            matchLabels:
              app: parallax-control-plane
      ports:
        - port: 8080
  egress:
    # Allow to Redis
    - to:
        - podSelector:
            matchLabels:
              app: parallax-redis
      ports:
        - port: 6379
    # Allow DNS
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - port: 53
          protocol: UDP
```

## Operations

### Scaling

```bash
# Scale control plane
kubectl scale statefulset parallax-control-plane -n parallax --replicas=5

# Scale agents
kubectl scale deployment parallax-agent-classification -n parallax --replicas=10
```

### Rolling Update

```bash
# Update control plane image
kubectl set image statefulset/parallax-control-plane \
  control-plane=parallax/control-plane:v1.1.0 \
  -n parallax

# Watch rollout
kubectl rollout status statefulset/parallax-control-plane -n parallax
```

### Rollback

```bash
# Rollback to previous version
kubectl rollout undo statefulset/parallax-control-plane -n parallax

# Rollback to specific revision
kubectl rollout undo statefulset/parallax-control-plane -n parallax --to-revision=2
```

### Debugging

```bash
# View logs
kubectl logs -f statefulset/parallax-control-plane -n parallax

# View logs for specific pod
kubectl logs parallax-control-plane-0 -n parallax

# Execute into pod
kubectl exec -it parallax-control-plane-0 -n parallax -- /bin/sh

# View events
kubectl get events -n parallax --sort-by='.lastTimestamp'

# Describe pod
kubectl describe pod parallax-control-plane-0 -n parallax
```

### Backup and Restore

```bash
# Backup Redis data
kubectl exec parallax-redis-0 -n parallax -- redis-cli BGSAVE

# Copy backup locally
kubectl cp parallax/parallax-redis-0:/data/dump.rdb ./backup/dump.rdb

# Restore from backup
kubectl cp ./backup/dump.rdb parallax/parallax-redis-0:/data/dump.rdb
kubectl exec parallax-redis-0 -n parallax -- redis-cli SHUTDOWN NOSAVE
# Pod will restart and load the dump
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl get pods -n parallax

# Check events
kubectl describe pod parallax-control-plane-0 -n parallax

# Check logs
kubectl logs parallax-control-plane-0 -n parallax --previous
```

### Connection Issues

```bash
# Test service connectivity
kubectl run test --rm -it --image=curlimages/curl -n parallax -- \
  curl http://parallax-control-plane:8080/health

# Check service endpoints
kubectl get endpoints parallax-control-plane -n parallax
```

### Performance Issues

```bash
# Check resource usage
kubectl top pods -n parallax

# Check node resources
kubectl top nodes

# View metrics
kubectl port-forward svc/parallax-control-plane 8080:8080 -n parallax
curl localhost:8080/metrics
```

## Next Steps

- [High Availability](/enterprise/high-availability) - HA configuration
- [Multi-Region](/enterprise/multi-region) - Geographic distribution
- [Security](/enterprise/security) - Security hardening
