import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTracingConfig, PARALLAX_ATTRIBUTES, SPAN_NAMES, EVENT_NAMES } from './config';

describe('getTracingConfig', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.ENABLE_TRACING;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_SERVICE_VERSION;
    delete process.env.OTEL_SERVICE_INSTANCE_ID;
    delete process.env.OTEL_DEPLOYMENT_ENVIRONMENT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_TRACES_EXPORTER;
    delete process.env.OTEL_TRACES_SAMPLER_ARG;
    delete process.env.OTEL_PROPAGATORS;
    delete process.env.OTEL_LOG_LEVEL;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('should return config with service name', () => {
    const config = getTracingConfig('test-service');
    expect(config.serviceName).toBe('test-service');
  });

  it('should use OTEL_SERVICE_NAME env var if set', () => {
    process.env.OTEL_SERVICE_NAME = 'custom-name';
    const config = getTracingConfig('test-service');
    expect(config.serviceName).toBe('custom-name');
  });

  it('should disable tracing when ENABLE_TRACING=false', () => {
    process.env.ENABLE_TRACING = 'false';
    const config = getTracingConfig('test-service');
    expect(config.exporterType).toBe('none');
  });

  it('should use default endpoint', () => {
    const config = getTracingConfig('test-service');
    expect(config.endpoint).toBe('http://localhost:4317');
  });

  it('should respect OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4317';
    const config = getTracingConfig('test-service');
    expect(config.endpoint).toBe('http://collector:4317');
  });

  it('should parse sampling ratio from env', () => {
    process.env.OTEL_TRACES_SAMPLER_ARG = '0.5';
    const config = getTracingConfig('test-service');
    expect(config.samplingRatio).toBe(0.5);
  });

  it('should parse propagators from comma-separated env', () => {
    process.env.OTEL_PROPAGATORS = 'w3c,b3,jaeger';
    const config = getTracingConfig('test-service');
    expect(config.propagators).toEqual(['w3c', 'b3', 'jaeger']);
  });

  it('should default propagators to w3c and b3', () => {
    const config = getTracingConfig('test-service');
    expect(config.propagators).toEqual(['w3c', 'b3']);
  });

  it('should set debug from OTEL_LOG_LEVEL', () => {
    process.env.OTEL_LOG_LEVEL = 'debug';
    const config = getTracingConfig('test-service');
    expect(config.debug).toBe(true);
  });
});

describe('PARALLAX_ATTRIBUTES', () => {
  it('should define all expected attribute keys', () => {
    expect(PARALLAX_ATTRIBUTES.PATTERN_NAME).toBe('parallax.pattern.name');
    expect(PARALLAX_ATTRIBUTES.AGENT_ID).toBe('parallax.agent.id');
    expect(PARALLAX_ATTRIBUTES.EXECUTION_ID).toBe('parallax.execution.id');
    expect(PARALLAX_ATTRIBUTES.CONFIDENCE_THRESHOLD).toBe('parallax.confidence.threshold');
  });
});

describe('SPAN_NAMES', () => {
  it('should define all expected span names', () => {
    expect(SPAN_NAMES.PATTERN_EXECUTE).toBe('pattern.execute');
    expect(SPAN_NAMES.AGENT_CALL).toBe('agent.call');
    expect(SPAN_NAMES.EXECUTION_START).toBe('execution.start');
    expect(SPAN_NAMES.CONFIDENCE_AGGREGATE).toBe('confidence.aggregate');
  });
});

describe('EVENT_NAMES', () => {
  it('should define all expected event names', () => {
    expect(EVENT_NAMES.PATTERN_START).toBe('pattern.start');
    expect(EVENT_NAMES.AGENT_SELECTED).toBe('agent.selected');
    expect(EVENT_NAMES.CACHE_HIT).toBe('cache.hit');
    expect(EVENT_NAMES.CIRCUIT_BREAKER_OPEN).toBe('circuit_breaker.open');
  });
});
