# OpenTelemetry Setup Guide

This guide explains how to set up distributed tracing with OpenTelemetry for the Parallax platform.

## Overview

OpenTelemetry provides:
- **Distributed Tracing**: Track requests across multiple services
- **Performance Monitoring**: Measure latency and throughput
- **Error Tracking**: Capture and analyze errors
- **Context Propagation**: Maintain context across service boundaries

## Quick Start

### 1. Start Jaeger (Development)

```bash
# Using Docker
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 14268:14268 \
  -p 14250:14250 \
  -p 4317:4317 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

# Access Jaeger UI at http://localhost:16686
```

### 2. Enable Tracing

Set environment variables:

```bash
# Enable tracing (default: true)
export ENABLE_TRACING=true

# Configure exporter
export OTEL_TRACES_EXPORTER=otlp  # or 'jaeger', 'console'
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Set service name
export OTEL_SERVICE_NAME=my-service
export OTEL_SERVICE_VERSION=1.0.0

# Configure sampling (1.0 = 100%)
export OTEL_TRACES_SAMPLER_ARG=1.0
```

### 3. Run Services with Tracing

```bash
# Control Plane
ENABLE_TRACING=true pnpm --filter @parallax/control-plane start

# Traced Agent
ENABLE_TRACING=true pnpm --filter @parallax/traced-agent-example dev
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_TRACING` | Enable/disable tracing | `true` |
| `OTEL_SERVICE_NAME` | Service name | Auto-detected |
| `OTEL_SERVICE_VERSION` | Service version | `0.1.0` |
| `OTEL_DEPLOYMENT_ENVIRONMENT` | Environment name | `development` |
| `OTEL_TRACES_EXPORTER` | Exporter type | `otlp` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint | `http://localhost:4317` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio (0-1) | `1.0` |
| `OTEL_PROPAGATORS` | Propagators | `w3c,b3` |
| `OTEL_LOG_LEVEL` | Log level | `info` |

### Programmatic Configuration

```typescript
import { initializeTracing, getTracingConfig } from '@parallax/telemetry';

// Initialize with defaults
const config = getTracingConfig('my-service');
const tracer = await initializeTracing(config, logger);

// Custom configuration
const customConfig = {
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  environment: 'production',
  endpoint: 'https://otel-collector.example.com:4317',
  exporterType: 'otlp',
  samplingRatio: 0.1, // Sample 10% in production
  propagators: ['w3c', 'b3', 'jaeger']
};
const tracer = await initializeTracing(customConfig, logger);
```

## Instrumentation

### Automatic Instrumentation

The platform automatically instruments:
- HTTP requests (Express)
- gRPC calls
- Pattern execution
- Agent communication

### Manual Instrumentation

#### Using Decorators

```typescript
import { Trace, SpanAttributes, MeasureDuration } from '@parallax/telemetry';

class MyService {
  @Trace('MyService.processData')
  @MeasureDuration()
  @SpanAttributes((data: any) => ({
    'data.size': data.length,
    'data.type': data.type
  }))
  async processData(data: any): Promise<any> {
    // Your code here
  }
}
```

#### Using Tracer API

```typescript
import { getGlobalTracer } from '@parallax/telemetry';

const tracer = getGlobalTracer();

// Wrap function with span
const result = await tracer.withSpan(
  'my-operation',
  async (span) => {
    span.setAttributes({
      'operation.type': 'processing',
      'data.size': 1000
    });
    
    // Your code here
    const result = await doWork();
    
    span.addEvent('processing.complete', {
      'result.size': result.length
    });
    
    return result;
  }
);
```

#### Pattern-Specific Tracing

```typescript
import { PatternTracer } from '@parallax/telemetry';

const patternTracer = new PatternTracer('control-plane');

// Trace pattern execution
await patternTracer.tracePatternExecution(
  'consensus-builder',
  input,
  async () => {
    // Pattern execution logic
  }
);

// Trace agent calls
await patternTracer.traceAgentCall(
  'agent-1',
  'analyze sentiment',
  async () => {
    // Agent call logic
  }
);
```

## Viewing Traces

### Jaeger UI

1. Open http://localhost:16686
2. Select service from dropdown
3. Click "Find Traces"
4. Click on a trace to view details

### Trace Analysis

Look for:
- **Latency**: Which operations are slow?
- **Errors**: Where are failures occurring?
- **Dependencies**: How do services interact?
- **Confidence**: Track confidence propagation

## Production Setup

### 1. Use OTLP Collector

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024
  
  memory_limiter:
    check_interval: 1s
    limit_mib: 512

exporters:
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true
  
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [jaeger]
```

### 2. Configure Sampling

```typescript
// Production sampling strategy
const config = {
  samplingRatio: 0.01, // 1% sampling
  // Or use parent-based sampling
  sampler: {
    type: 'parentBased',
    root: {
      type: 'traceIdRatio',
      ratio: 0.01
    }
  }
};
```

### 3. Security

```bash
# Use TLS for OTLP
export OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example.com:4317
export OTEL_EXPORTER_OTLP_CERTIFICATE=/path/to/cert.pem
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer token"
```

## Kubernetes Deployment

### Deploy OpenTelemetry Operator

```bash
# Install cert-manager (required)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Install OpenTelemetry Operator
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml
```

### Configure Auto-Instrumentation

```yaml
apiVersion: opentelemetry.io/v1alpha1
kind: Instrumentation
metadata:
  name: parallax-instrumentation
spec:
  exporter:
    endpoint: http://otel-collector:4317
  propagators:
    - w3c
    - b3
  sampler:
    type: parentbased_traceidratio
    argument: "0.1"
  nodejs:
    env:
      - name: OTEL_NODEJS_DEBUG
        value: "true"
```

### Annotate Pods

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: parallax-agent
spec:
  template:
    metadata:
      annotations:
        instrumentation.opentelemetry.io/inject-nodejs: "true"
    spec:
      containers:
      - name: agent
        image: parallax/agent:latest
```

## Best Practices

### 1. Span Naming

Use consistent naming:
```
service.operation
pattern.execute.consensus-builder
agent.call.sentiment-1
confidence.aggregate
```

### 2. Attributes

Add meaningful attributes:
```typescript
span.setAttributes({
  'parallax.pattern.name': 'consensus-builder',
  'parallax.agent.count': 5,
  'parallax.confidence.threshold': 0.8,
  'parallax.execution.id': executionId
});
```

### 3. Error Handling

Always record exceptions:
```typescript
try {
  // Your code
} catch (error) {
  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message
  });
  throw error;
}
```

### 4. Context Propagation

Maintain context across async operations:
```typescript
import { context, trace } from '@opentelemetry/api';

const ctx = context.active();
await Promise.all(
  agents.map(agent => 
    context.with(ctx, () => agent.analyze(task))
  )
);
```

## Troubleshooting

### No Traces Appearing

1. Check environment variables:
```bash
env | grep OTEL
```

2. Enable debug logging:
```bash
export OTEL_LOG_LEVEL=debug
```

3. Test with console exporter:
```bash
export OTEL_TRACES_EXPORTER=console
```

### Missing Spans

- Ensure context is propagated correctly
- Check sampling configuration
- Verify instrumentation is loaded

### Performance Impact

- Use sampling in production
- Batch span exports
- Limit attribute size
- Use async exporters

## Monitoring Tracing Health

### Metrics

Monitor these metrics:
- Spans exported/dropped
- Export latency
- Sampling rate
- Error rate

### Alerts

Set alerts for:
- High span drop rate
- Export failures
- Collector memory usage
- Unusual trace patterns

## Integration Examples

### Express Middleware

```typescript
app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'http.user_agent': req.headers['user-agent'],
      'http.client_ip': req.ip
    });
  }
  next();
});
```

### Agent Integration

```typescript
class MyAgent extends ParallaxAgent {
  async analyze(task: string, data?: any): Promise<[any, number]> {
    return tracer.withSpan(
      `${this.name}.analyze`,
      async (span) => {
        span.setAttribute('agent.task', task);
        const result = await this.doAnalysis(task, data);
        span.setAttribute('agent.confidence', result[1]);
        return result;
      }
    );
  }
}
```

## Next Steps

- [Metrics Collection](./metrics.md) - Prometheus metrics
- [Logging](./logging.md) - Structured logging
- [Dashboards](./dashboards.md) - Grafana dashboards