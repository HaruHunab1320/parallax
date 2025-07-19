# Monitoring Integration Guide

This guide explains how to integrate the Parallax monitoring stack with your control plane.

## Quick Start

1. **Start the monitoring stack**:
   ```bash
   cd packages/monitoring
   npm run start:local
   ```

2. **Configure Control Plane**:
   Set these environment variables in your control plane:
   ```bash
   # Enable metrics collection
   PARALLAX_METRICS_ENABLED=true
   
   # Enable OpenTelemetry tracing
   ENABLE_TRACING=true
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
   OTEL_SERVICE_NAME=parallax-control-plane
   ```

3. **Access Dashboards**:
   - Grafana: http://localhost:3000 (admin/admin)
   - Prometheus: http://localhost:9090
   - Jaeger: http://localhost:16686

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Control Plane  │────▶│  Prometheus  │────▶│   Grafana   │
│   (metrics)     │     │   (scrape)   │     │ (visualize) │
└─────────────────┘     └──────────────┘     └─────────────┘
         │                                           
         │ (traces)                                  
         ▼                                           
┌─────────────────┐                                  
│     Jaeger      │                                  
│  (distributed   │                                  
│    tracing)     │                                  
└─────────────────┘                                  
```

## Metrics Exposed

The control plane exposes metrics at `http://localhost:9090/metrics`:

### Pattern Metrics
- `parallax_pattern_executions_total` - Total pattern executions
- `parallax_pattern_execution_duration_seconds` - Execution duration histogram
- `parallax_confidence_scores` - Confidence score gauge

### Agent Metrics
- `parallax_agent_requests_total` - Total agent requests
- `parallax_agent_response_time_seconds` - Response time histogram
- `parallax_active_agents` - Number of active agents

### System Metrics
- Default Node.js metrics (CPU, memory, event loop)
- Process metrics
- HTTP request metrics

## Tracing Integration

OpenTelemetry traces are automatically sent to Jaeger when enabled:

1. **Pattern Execution Traces**:
   - Span for entire pattern execution
   - Child spans for agent selection and invocation
   - Confidence calculation spans

2. **HTTP Request Traces**:
   - Automatic instrumentation for all Express routes
   - Database query spans

## Custom Metrics

To add custom metrics in your code:

```typescript
import { MetricsCollector } from '@/metrics';

// In your service
const metrics = new MetricsCollector();

// Increment counter
metrics.incrementPatternExecution('my-pattern', 'completed');

// Record histogram value
metrics.recordExecutionDuration('my-pattern', 1.234);

// Set gauge value
metrics.setActiveAgents(5);
```

## Alerting

Prometheus alerts are configured in `prometheus/alerts/parallax.yml`:

- **HighPatternFailureRate**: Pattern failure rate > 10%
- **LowAgentAvailability**: Less than 3 agents available
- **ConfidenceCalibrationDrift**: Calibration error > 20%
- **ControlPlaneDown**: Control plane not responding

## Production Deployment

For production, deploy each component separately:

1. **Prometheus**: Use Prometheus Operator on Kubernetes
2. **Grafana**: Deploy with persistent storage
3. **Jaeger**: Use Elasticsearch backend for scale

See the Kubernetes deployment guide for details.

## Troubleshooting

### No metrics showing in Grafana
1. Check Prometheus targets: http://localhost:9090/targets
2. Ensure control plane is exposing metrics endpoint
3. Verify network connectivity

### No traces in Jaeger
1. Check OTEL environment variables
2. Verify Jaeger is receiving data: http://localhost:16686
3. Check control plane logs for tracing errors

### High memory usage
1. Adjust Prometheus retention: `--storage.tsdb.retention.time=7d`
2. Configure sampling in Jaeger
3. Limit metrics cardinality