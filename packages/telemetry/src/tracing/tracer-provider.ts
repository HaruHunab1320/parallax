/**
 * OpenTelemetry Tracer Provider for Parallax platform
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { 
  SEMRESATTRS_SERVICE_NAME as ATTR_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION as ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_INSTANCE_ID as ATTR_SERVICE_INSTANCE_ID,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT as ATTR_DEPLOYMENT_ENVIRONMENT_NAME
} from '@opentelemetry/semantic-conventions';
import { 
  NodeTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor
} from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { B3Propagator, B3InjectEncoding } from '@opentelemetry/propagator-b3';
import { JaegerPropagator } from '@opentelemetry/propagator-jaeger';
import { CompositePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { Logger } from 'pino';
import * as api from '@opentelemetry/api';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  instanceId?: string;
  environment?: string;
  endpoint?: string;
  exporterType?: 'otlp' | 'jaeger' | 'console' | 'none';
  samplingRatio?: number;
  propagators?: string[];
  debug?: boolean;
}

export class TracerProvider {
  private sdk?: NodeSDK;
  private provider?: NodeTracerProvider;
  
  constructor(
    private config: TracingConfig,
    private logger: Logger
  ) {}
  
  /**
   * Initialize the tracer provider
   */
  async initialize(): Promise<void> {
    this.logger.info({ config: this.config }, 'Initializing OpenTelemetry tracing');
    
    // Create resource
    const resource = Resource.default().merge(
      new Resource({
        [ATTR_SERVICE_NAME]: this.config.serviceName,
        [ATTR_SERVICE_VERSION]: this.config.serviceVersion || '0.1.0',
        [ATTR_SERVICE_INSTANCE_ID]: this.config.instanceId || `${this.config.serviceName}-${Date.now()}`,
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: this.config.environment || 'development',
        'parallax.platform.version': '0.1.0',
        'parallax.service.type': this.getServiceType(this.config.serviceName)
      })
    );
    
    // Create tracer provider
    this.provider = new NodeTracerProvider({
      resource,
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(
          this.config.samplingRatio || 1.0
        )
      })
    });
    
    // Configure exporter
    const exporter = this.createExporter();
    if (exporter) {
      if (this.config.debug) {
        this.provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
      } else {
        this.provider.addSpanProcessor(new BatchSpanProcessor(exporter));
      }
    }
    
    // Register provider
    this.provider.register({
      propagator: this.createPropagator()
    });
    
    // Register instrumentations
    this.registerInstrumentations();
    
    // Create SDK for graceful shutdown
    this.sdk = new NodeSDK({
      resource,
      instrumentations: this.getInstrumentations()
    });
    
    await this.sdk.start();
    
    this.logger.info('OpenTelemetry tracing initialized');
  }
  
  /**
   * Create the appropriate exporter based on configuration
   */
  private createExporter() {
    switch (this.config.exporterType) {
      case 'otlp':
        return new OTLPTraceExporter({
          url: this.config.endpoint || 'http://localhost:4317',
          headers: {
            'x-service-name': this.config.serviceName
          }
        });
        
      case 'jaeger':
        return new JaegerExporter({
          endpoint: this.config.endpoint || 'http://localhost:14268/api/traces'
        });
        
      case 'console':
        return new ConsoleSpanExporter();
        
      case 'none':
        return null;
        
      default:
        // Default to OTLP
        return new OTLPTraceExporter({
          url: this.config.endpoint || 'http://localhost:4317'
        });
    }
  }
  
  /**
   * Create composite propagator
   */
  private createPropagator() {
    const propagators: api.TextMapPropagator[] = [];
    
    const configuredPropagators = this.config.propagators || ['w3c', 'b3'];
    
    for (const propagator of configuredPropagators) {
      switch (propagator) {
        case 'w3c':
          propagators.push(new W3CTraceContextPropagator());
          break;
        case 'b3':
          propagators.push(new B3Propagator({
            injectEncoding: B3InjectEncoding.MULTI_HEADER
          }));
          break;
        case 'jaeger':
          propagators.push(new JaegerPropagator());
          break;
      }
    }
    
    return new CompositePropagator({
      propagators
    });
  }
  
  /**
   * Register instrumentations
   */
  private registerInstrumentations(): void {
    registerInstrumentations({
      instrumentations: this.getInstrumentations()
    });
  }
  
  /**
   * Get instrumentations
   */
  private getInstrumentations() {
    return [
      new GrpcInstrumentation({
        ignoreGrpcMethods: ['HealthCheck']
      }),
      new HttpInstrumentation({
        requestHook: (span, request) => {
          if ('headers' in request) {
            span.setAttributes({
              'http.request.body.size': (request as any).headers['content-length'] || 0
            });
          }
        }
      }),
      new ExpressInstrumentation({
        requestHook: (span, info) => {
          span.setAttributes({
            'express.route': info.route
          });
        }
      })
    ];
  }
  
  /**
   * Get tracer instance
   */
  getTracer(name?: string): api.Tracer {
    return api.trace.getTracer(
      name || this.config.serviceName,
      this.config.serviceVersion
    );
  }
  
  /**
   * Create a new span
   */
  startSpan(
    name: string,
    options?: api.SpanOptions,
    context?: api.Context
  ): api.Span {
    const tracer = this.getTracer();
    
    if (context) {
      return tracer.startSpan(name, options, context);
    }
    
    return tracer.startActiveSpan(name, options || {}, (span) => span);
  }
  
  /**
   * Wrap a function with a span
   */
  async withSpan<T>(
    name: string,
    fn: (span: api.Span) => Promise<T>,
    options?: api.SpanOptions
  ): Promise<T> {
    const tracer = this.getTracer();
    
    return tracer.startActiveSpan(name, options || {}, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: api.SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: api.SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  /**
   * Add event to current span
   */
  addEvent(name: string, attributes?: api.Attributes): void {
    const span = api.trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }
  
  /**
   * Set attributes on current span
   */
  setAttributes(attributes: api.Attributes): void {
    const span = api.trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }
  
  /**
   * Set baggage
   */
  setBaggage(key: string, value: string): void {
    const baggage = api.propagation.getBaggage(api.context.active()) || api.propagation.createBaggage();
    const updatedBaggage = baggage.setEntry(key, { value });
    api.propagation.setBaggage(api.context.active(), updatedBaggage);
  }
  
  /**
   * Get baggage
   */
  getBaggage(key: string): string | undefined {
    const baggage = api.propagation.getBaggage(api.context.active());
    return baggage?.getEntry(key)?.value;
  }
  
  /**
   * Shutdown the tracer
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down OpenTelemetry tracing');
    
    if (this.sdk) {
      await this.sdk.shutdown();
    }
  }
  
  /**
   * Get service type from name
   */
  private getServiceType(serviceName: string): string {
    if (serviceName.includes('control-plane')) return 'control-plane';
    if (serviceName.includes('agent')) return 'agent';
    if (serviceName.includes('cli')) return 'client';
    return 'service';
  }
}

/**
 * Global tracer instance
 */
let globalTracer: TracerProvider | null = null;

/**
 * Initialize global tracer
 */
export async function initializeTracing(
  config: TracingConfig,
  logger: Logger
): Promise<TracerProvider> {
  if (globalTracer) {
    return globalTracer;
  }
  
  globalTracer = new TracerProvider(config, logger);
  await globalTracer.initialize();
  
  return globalTracer;
}

/**
 * Get global tracer
 */
export function getGlobalTracer(): TracerProvider {
  if (!globalTracer) {
    throw new Error('Tracer not initialized. Call initializeTracing first.');
  }
  
  return globalTracer;
}