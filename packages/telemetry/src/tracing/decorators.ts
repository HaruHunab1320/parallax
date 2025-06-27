/**
 * OpenTelemetry decorators for easy instrumentation
 */

import * as api from '@opentelemetry/api';
import { getGlobalTracer } from './tracer-provider';

/**
 * Trace a method
 */
export function Trace(spanName?: string, options?: api.SpanOptions) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = propertyKey;
    
    descriptor.value = async function (...args: any[]) {
      const tracer = getGlobalTracer();
      const name = spanName || `${className}.${methodName}`;
      
      return tracer.withSpan(
        name,
        async (span) => {
          // Add method metadata
          span.setAttributes({
            'code.function': methodName,
            'code.namespace': className,
            'parallax.method.args_count': args.length
          });
          
          // Add custom attributes from options
          if (options?.attributes) {
            span.setAttributes(options.attributes);
          }
          
          // Execute method
          const result = await originalMethod.apply(this, args);
          
          // Add result metadata if available
          if (result !== undefined && result !== null) {
            span.setAttribute('parallax.method.has_result', true);
            
            // Add confidence if available
            if (typeof result === 'object' && 'confidence' in result) {
              span.setAttribute('parallax.confidence', result.confidence);
            }
          }
          
          return result;
        },
        options
      );
    };
    
    return descriptor;
  };
}

/**
 * Trace a class (all methods)
 */
export function TraceClass(options?: { prefix?: string }) {
  return function <T extends { new(...args: any[]): {} }>(constructor: T) {
    const className = constructor.name;
    const prefix = options?.prefix || className;
    
    // Get all method names
    const methodNames = Object.getOwnPropertyNames(constructor.prototype)
      .filter(name => 
        name !== 'constructor' && 
        typeof constructor.prototype[name] === 'function'
      );
    
    // Apply tracing to each method
    methodNames.forEach(methodName => {
      const descriptor = Object.getOwnPropertyDescriptor(
        constructor.prototype,
        methodName
      );
      
      if (descriptor && descriptor.value) {
        Trace(`${prefix}.${methodName}`)(
          constructor.prototype,
          methodName,
          descriptor
        );
        
        Object.defineProperty(
          constructor.prototype,
          methodName,
          descriptor
        );
      }
    });
    
    return constructor;
  };
}

/**
 * Add span attributes
 */
export function SpanAttributes(
  attributesOrFn: api.Attributes | ((...args: any[]) => api.Attributes)
) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const span = api.trace.getActiveSpan();
      
      if (span) {
        const attributes = typeof attributesOrFn === 'function'
          ? attributesOrFn(...args)
          : attributesOrFn;
        
        span.setAttributes(attributes);
      }
      
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}

/**
 * Record exceptions in span
 */
export function RecordExceptions() {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const span = api.trace.getActiveSpan();
        
        if (span && error instanceof Error) {
          span.recordException(error);
          span.setStatus({
            code: api.SpanStatusCode.ERROR,
            message: error.message
          });
        }
        
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Add event to span
 */
export function SpanEvent(
  eventName: string,
  attributesOrFn?: api.Attributes | ((...args: any[]) => api.Attributes)
) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const span = api.trace.getActiveSpan();
      
      if (span) {
        const attributes = attributesOrFn
          ? (typeof attributesOrFn === 'function'
            ? attributesOrFn(...args)
            : attributesOrFn)
          : undefined;
        
        span.addEvent(eventName, attributes);
      }
      
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}

/**
 * Measure method duration
 */
export function MeasureDuration(metricName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = propertyKey;
    
    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const span = api.trace.getActiveSpan();
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;
        
        if (span) {
          span.setAttribute(
            metricName || `${className}.${methodName}.duration_ms`,
            duration
          );
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        if (span) {
          span.setAttribute(
            metricName || `${className}.${methodName}.duration_ms`,
            duration
          );
          span.setAttribute(
            `${className}.${methodName}.failed`,
            true
          );
        }
        
        throw error;
      }
    };
    
    return descriptor;
  };
}