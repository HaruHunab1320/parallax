# @parallax/monitoring

Monitoring and observability configurations for the Parallax AI orchestration platform.

## Overview

This package provides:
- Grafana dashboards for visualizing Parallax metrics
- Prometheus configuration for metrics collection
- Jaeger setup for distributed tracing
- Docker Compose for local monitoring stack

## Quick Start

### Local Development

```bash
# Start monitoring stack
npm run start:local

# Access services
# - Grafana: http://localhost:3000 (admin/admin)
# - Prometheus: http://localhost:9090
# - Jaeger: http://localhost:16686

# Stop monitoring stack
npm run stop:local
```

### Production Deployment

Use the configurations with your existing monitoring infrastructure:

```bash
# Import Grafana dashboards
for dashboard in grafana/dashboards/*.json; do
  curl -X POST http://grafana:3000/api/dashboards/db \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $GRAFANA_API_KEY" \
    -d @$dashboard
done

# Apply Prometheus configuration
kubectl create configmap prometheus-config \
  --from-file=prometheus/prometheus.yml \
  -n monitoring
```

## Grafana Dashboards

### System Overview Dashboard
- Agent count and status
- Pattern execution rate
- System resource usage
- Error rates and alerts

### Pattern Execution Dashboard
- Execution times by pattern
- Confidence score distributions
- Success/failure rates
- Pattern usage trends

### Agent Performance Dashboard
- Individual agent metrics
- Response time percentiles
- Capability utilization
- Error analysis

### Confidence Analytics Dashboard
- Confidence score trends
- Calibration metrics
- Uncertainty analysis
- Decision accuracy

## Prometheus Configuration

### Metrics Collected

```yaml
# Core metrics
parallax_pattern_executions_total
parallax_pattern_execution_duration_seconds
parallax_agent_requests_total
parallax_agent_response_time_seconds
parallax_confidence_scores
parallax_active_agents
parallax_circuit_breaker_state

# Business metrics
parallax_pattern_success_rate
parallax_agent_availability
parallax_confidence_calibration_error
```

### Alerting Rules

```yaml
groups:
- name: parallax_alerts
  rules:
  - alert: HighPatternFailureRate
    expr: rate(parallax_pattern_failures_total[5m]) > 0.1
    annotations:
      summary: "High pattern failure rate"
      
  - alert: LowAgentAvailability
    expr: parallax_active_agents < 3
    annotations:
      summary: "Insufficient agents available"
      
  - alert: ConfidenceDrift
    expr: abs(parallax_confidence_calibration_error) > 0.2
    annotations:
      summary: "Confidence scores drifting from actual outcomes"
```

## Jaeger Tracing

### Trace Points

- Pattern execution flow
- Agent communication
- Confidence propagation
- Cache hits/misses
- Circuit breaker events

### Configuration

```yaml
# jaeger/jaeger-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: jaeger-config
data:
  sampling.json: |
    {
      "service_strategies": [
        {
          "service": "parallax-*",
          "type": "adaptive",
          "max_traces_per_second": 100
        }
      ]
    }
```

## Docker Compose Stack

```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus:/etc/prometheus
    ports:
      - "9090:9090"
      
  grafana:
    image: grafana/grafana:latest
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
    ports:
      - "3000:3000"
      
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "14268:14268"
```

## Custom Metrics

### Adding New Metrics

1. Define metric in Parallax code:
```typescript
const patternExecutions = new Counter({
  name: 'parallax_pattern_executions_total',
  help: 'Total pattern executions',
  labelNames: ['pattern', 'status']
});
```

2. Create Grafana panel:
```json
{
  "targets": [{
    "expr": "rate(parallax_pattern_executions_total[5m])",
    "legendFormat": "{{pattern}} - {{status}}"
  }]
}
```

3. Add Prometheus rule if needed:
```yaml
- record: pattern:execution_rate5m
  expr: rate(parallax_pattern_executions_total[5m])
```

## Integration

### With Kubernetes

```bash
# Deploy Prometheus Operator
kubectl apply -f https://github.com/prometheus-operator/prometheus-operator/releases/download/v0.68.0/bundle.yaml

# Apply ServiceMonitor
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: parallax
spec:
  selector:
    matchLabels:
      app: parallax
  endpoints:
  - port: metrics
EOF
```

### With Cloud Providers

- **AWS**: CloudWatch integration via OTEL collector
- **GCP**: Stackdriver integration
- **Azure**: Monitor integration

## Best Practices

1. **Retention**: Keep high-resolution data for 7 days, downsampled for 30 days
2. **Cardinality**: Limit label combinations to prevent metric explosion
3. **Dashboards**: Use variables for flexibility across environments
4. **Alerts**: Start with critical alerts, add more as you learn the system
5. **Sampling**: Use adaptive sampling for traces in production