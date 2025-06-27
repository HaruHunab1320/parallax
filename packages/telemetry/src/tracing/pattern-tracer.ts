/**
 * Pattern-specific tracing for Parallax
 */

import * as api from '@opentelemetry/api';
import { 
  SEMATTRS_CODE_FUNCTION as ATTR_CODE_FUNCTION,
  SEMATTRS_CODE_NAMESPACE as ATTR_CODE_NAMESPACE
} from '@opentelemetry/semantic-conventions';

export class PatternTracer {
  private tracer: api.Tracer;
  
  constructor(serviceName: string, version?: string) {
    this.tracer = api.trace.getTracer(serviceName, version);
  }
  
  /**
   * Trace pattern execution
   */
  async tracePatternExecution<T>(
    patternName: string,
    input: any,
    executeFn: () => Promise<T>
  ): Promise<T> {
    return this.tracer.startActiveSpan(
      `pattern.execute.${patternName}`,
      {
        kind: api.SpanKind.INTERNAL,
        attributes: {
          'parallax.pattern.name': patternName,
          'parallax.pattern.input_size': JSON.stringify(input).length,
          [ATTR_CODE_NAMESPACE]: 'PatternEngine',
          [ATTR_CODE_FUNCTION]: 'executePattern'
        }
      },
      async (span) => {
        try {
          // Start timing
          const startTime = performance.now();
          
          // Add pattern start event
          span.addEvent('pattern.start', {
            'parallax.pattern.timestamp': new Date().toISOString()
          });
          
          // Execute pattern
          const result = await executeFn();
          
          // Calculate duration
          const duration = performance.now() - startTime;
          
          // Add result attributes
          span.setAttributes({
            'parallax.pattern.duration_ms': duration,
            'parallax.pattern.success': true
          });
          
          // Add confidence if available
          if (result && typeof result === 'object' && 'confidence' in result) {
            span.setAttribute('parallax.pattern.confidence', (result as any).confidence);
          }
          
          // Add pattern complete event
          span.addEvent('pattern.complete', {
            'parallax.pattern.duration_ms': duration
          });
          
          span.setStatus({ code: api.SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: api.SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Pattern execution failed'
          });
          
          // Add pattern error event
          span.addEvent('pattern.error', {
            'parallax.pattern.error': error instanceof Error ? error.message : 'Unknown error'
          });
          
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
  
  /**
   * Trace agent selection
   */
  traceAgentSelection(
    patternName: string,
    capability: string,
    selectedAgents: string[]
  ): void {
    const span = api.trace.getActiveSpan();
    if (span) {
      span.addEvent('agent.selection', {
        'parallax.pattern.name': patternName,
        'parallax.agent.capability': capability,
        'parallax.agent.count': selectedAgents.length,
        'parallax.agent.ids': selectedAgents.join(',')
      });
    }
  }
  
  /**
   * Trace agent call
   */
  async traceAgentCall<T>(
    agentId: string,
    task: string,
    callFn: () => Promise<T>
  ): Promise<T> {
    const parentSpan = api.trace.getActiveSpan();
    const ctx = parentSpan ? api.trace.setSpan(api.context.active(), parentSpan) : api.context.active();
    
    return this.tracer.startActiveSpan(
      `agent.call.${agentId}`,
      {
        kind: api.SpanKind.CLIENT,
        attributes: {
          'parallax.agent.id': agentId,
          'parallax.agent.task': task,
          'rpc.system': 'grpc',
          'rpc.service': 'ConfidenceAgent',
          'rpc.method': 'Analyze'
        }
      },
      ctx,
      async (span: api.Span) => {
        try {
          const startTime = performance.now();
          
          // Execute agent call
          const result = await callFn();
          
          const duration = performance.now() - startTime;
          
          // Add result attributes
          span.setAttributes({
            'parallax.agent.duration_ms': duration,
            'parallax.agent.success': true
          });
          
          // Add confidence if available
          if (result && typeof result === 'object' && 'confidence' in result) {
            span.setAttribute('parallax.agent.confidence', (result as any).confidence);
          }
          
          span.setStatus({ code: api.SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: api.SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Agent call failed'
          });
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
  
  /**
   * Trace confidence aggregation
   */
  traceConfidenceAggregation(
    method: string,
    inputs: Array<{ agentId: string; confidence: number }>,
    result: number
  ): void {
    const span = api.trace.getActiveSpan();
    if (span) {
      span.addEvent('confidence.aggregation', {
        'parallax.aggregation.method': method,
        'parallax.aggregation.input_count': inputs.length,
        'parallax.aggregation.result': result,
        'parallax.aggregation.min_confidence': Math.min(...inputs.map(i => i.confidence)),
        'parallax.aggregation.max_confidence': Math.max(...inputs.map(i => i.confidence)),
        'parallax.aggregation.avg_confidence': 
          inputs.reduce((sum, i) => sum + i.confidence, 0) / inputs.length
      });
    }
  }
  
  /**
   * Create pattern execution context
   */
  createPatternContext(
    patternName: string,
    executionId: string
  ): api.Context {
    const span = this.tracer.startSpan(`pattern.context.${patternName}`, {
      attributes: {
        'parallax.pattern.name': patternName,
        'parallax.execution.id': executionId
      }
    });
    
    return api.trace.setSpan(api.context.active(), span);
  }
  
  /**
   * Add pattern metadata to current span
   */
  addPatternMetadata(metadata: {
    minAgents?: number;
    confidenceThreshold?: number;
    timeout?: string;
    retries?: number;
  }): void {
    const span = api.trace.getActiveSpan();
    if (span) {
      const attributes: api.Attributes = {};
      
      if (metadata.minAgents !== undefined) {
        attributes['parallax.pattern.min_agents'] = metadata.minAgents;
      }
      if (metadata.confidenceThreshold !== undefined) {
        attributes['parallax.pattern.confidence_threshold'] = metadata.confidenceThreshold;
      }
      if (metadata.timeout !== undefined) {
        attributes['parallax.pattern.timeout'] = metadata.timeout;
      }
      if (metadata.retries !== undefined) {
        attributes['parallax.pattern.retries'] = metadata.retries;
      }
      
      span.setAttributes(attributes);
    }
  }
  
  /**
   * Create linked span for pattern composition
   */
  createLinkedSpan(
    name: string,
    parentPattern: string,
    childPattern: string,
    links?: api.Link[]
  ): api.Span {
    const currentSpan = api.trace.getActiveSpan();
    const spanLinks: api.Link[] = links || [];
    
    if (currentSpan) {
      spanLinks.push({
        context: currentSpan.spanContext(),
        attributes: {
          'parallax.link.type': 'pattern_composition',
          'parallax.link.parent_pattern': parentPattern,
          'parallax.link.child_pattern': childPattern
        }
      });
    }
    
    return this.tracer.startSpan(name, {
      kind: api.SpanKind.INTERNAL,
      links: spanLinks,
      attributes: {
        'parallax.pattern.parent': parentPattern,
        'parallax.pattern.child': childPattern
      }
    });
  }
}