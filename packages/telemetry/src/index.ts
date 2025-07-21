export * from './tracing/tracer-provider';
export * from './tracing/pattern-tracer';
export * from './config';

// Re-export commonly used OpenTelemetry APIs
export { 
  trace,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  SpanStatus
} from '@opentelemetry/api';

// Export types
export type {
  Span,
  Tracer,
  SpanOptions,
  SpanContext,
  Context,
  Attributes,
  AttributeValue
} from '@opentelemetry/api';