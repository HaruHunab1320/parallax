/**
 * OpenTelemetry configuration for Parallax
 */

import { TracingConfig } from './tracing/tracer-provider';

/**
 * Get tracing configuration from environment
 */
export function getTracingConfig(serviceName: string): TracingConfig {
  const enabled = process.env.ENABLE_TRACING !== 'false';
  
  if (!enabled) {
    return {
      serviceName,
      exporterType: 'none'
    };
  }
  
  return {
    serviceName: process.env.OTEL_SERVICE_NAME || serviceName,
    serviceVersion: process.env.OTEL_SERVICE_VERSION || process.env.npm_package_version || '0.1.0',
    instanceId: process.env.OTEL_SERVICE_INSTANCE_ID || `${serviceName}-${process.pid}`,
    environment: process.env.OTEL_DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development',
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    exporterType: (process.env.OTEL_TRACES_EXPORTER as any) || 'otlp',
    samplingRatio: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '1.0'),
    propagators: process.env.OTEL_PROPAGATORS?.split(',') || ['w3c', 'b3'],
    debug: process.env.OTEL_LOG_LEVEL === 'debug'
  };
}

/**
 * Common span attributes for Parallax
 */
export const PARALLAX_ATTRIBUTES = {
  PATTERN_NAME: 'parallax.pattern.name',
  PATTERN_VERSION: 'parallax.pattern.version',
  PATTERN_CONFIDENCE: 'parallax.pattern.confidence',
  AGENT_ID: 'parallax.agent.id',
  AGENT_NAME: 'parallax.agent.name',
  AGENT_CAPABILITY: 'parallax.agent.capability',
  AGENT_CONFIDENCE: 'parallax.agent.confidence',
  EXECUTION_ID: 'parallax.execution.id',
  TASK_TYPE: 'parallax.task.type',
  CONFIDENCE_THRESHOLD: 'parallax.confidence.threshold',
  UNCERTAINTY_LEVEL: 'parallax.uncertainty.level'
} as const;

/**
 * Span names for consistency
 */
export const SPAN_NAMES = {
  // Pattern operations
  PATTERN_EXECUTE: 'pattern.execute',
  PATTERN_LOAD: 'pattern.load',
  PATTERN_COMPILE: 'pattern.compile',
  PATTERN_VALIDATE: 'pattern.validate',
  
  // Agent operations
  AGENT_CALL: 'agent.call',
  AGENT_SELECT: 'agent.select',
  AGENT_REGISTER: 'agent.register',
  AGENT_HEALTH_CHECK: 'agent.health_check',
  
  // Confidence operations
  CONFIDENCE_AGGREGATE: 'confidence.aggregate',
  CONFIDENCE_PROPAGATE: 'confidence.propagate',
  CONFIDENCE_VALIDATE: 'confidence.validate',
  
  // Execution operations
  EXECUTION_START: 'execution.start',
  EXECUTION_COMPLETE: 'execution.complete',
  EXECUTION_RETRY: 'execution.retry',
  EXECUTION_CACHE_HIT: 'execution.cache_hit'
} as const;

/**
 * Event names for consistency
 */
export const EVENT_NAMES = {
  PATTERN_START: 'pattern.start',
  PATTERN_COMPLETE: 'pattern.complete',
  PATTERN_ERROR: 'pattern.error',
  AGENT_SELECTED: 'agent.selected',
  AGENT_RESPONDED: 'agent.responded',
  CONFIDENCE_CALCULATED: 'confidence.calculated',
  CACHE_HIT: 'cache.hit',
  CACHE_MISS: 'cache.miss',
  RETRY_ATTEMPT: 'retry.attempt',
  CIRCUIT_BREAKER_OPEN: 'circuit_breaker.open',
  CIRCUIT_BREAKER_CLOSE: 'circuit_breaker.close'
} as const;