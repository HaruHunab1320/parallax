import { PrismRuntimePool } from './prism-runtime-pool';
import { RuntimeConfig, RuntimeInstance } from './types';
import { Logger } from 'pino';

export class RuntimeManager {
  private pool: PrismRuntimePool;
  private logger: Logger;

  constructor(config: RuntimeConfig, logger: Logger) {
    this.pool = new PrismRuntimePool(config);
    this.logger = logger;

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.pool.on('instance:created', (instance: RuntimeInstance) => {
      this.logger.info({ instanceId: instance.id }, 'Runtime instance created');
    });

    this.pool.on('instance:released', (instance: RuntimeInstance) => {
      this.logger.debug(
        { instanceId: instance.id },
        'Runtime instance released'
      );
    });
  }

  async executePrismScript(script: string, context?: any): Promise<any> {
    const instance = await this.pool.acquireInstance();

    try {
      this.logger.debug({ instanceId: instance.id }, 'Executing Prism script');

      // Inject context variables into the script
      const enhancedScript = this.injectContext(script, context);

      // Debug: Save the enhanced script
      try {
        require('fs').writeFileSync(
          '/tmp/enhanced-script.prism',
          enhancedScript
        );
        this.logger.info('Saved enhanced script to /tmp/enhanced-script.prism');
      } catch (e) {
        // ignore
      }

      const result = await this.runPrismCode(enhancedScript, instance);

      return result;
    } catch (error) {
      this.logger.error(
        { instanceId: instance.id, error },
        'Script execution failed'
      );
      throw error;
    } finally {
      this.pool.releaseInstance(instance.id);
    }
  }

  private injectContext(script: string, context: any): string {
    if (!context) return script;

    // Build a preamble that defines all context variables as Prism variables
    const preamble: string[] = [];

    // Helper function to convert JS values to Prism syntax
    const toPrismValue = (value: any, depth: number = 0): string => {
      if (value === null) return 'null'; // Prism 1.0.11 supports null
      if (value === undefined) return 'null'; // Convert undefined to null
      if (typeof value === 'string') {
        // Escape quotes, newlines, and template literal interpolations (${})
        return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\$\{/g, '\\${')}"`;
      }
      if (typeof value === 'number') return value.toString();
      if (typeof value === 'boolean') return value.toString();
      if (Array.isArray(value)) {
        const elements = value
          .map((v) => toPrismValue(v, depth + 1))
          .join(', ');
        return `[${elements}]`;
      }
      if (typeof value === 'object') {
        const props = Object.entries(value)
          .map(([k, v]) => {
            // Rename 'agents' key to 'agentList' in nested objects too
            const rawKey = k === 'agents' ? 'agentList' : k;
            // Always quote keys to avoid Prism interpreting them as variable references
            const prismKey = `"${rawKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            return `${prismKey}: ${toPrismValue(v, depth + 1)}`;
          })
          .join(', ');
        return `{${props}}`;
      }
      return 'null'; // Default to null for unknown types
    };

    // Inject all context variables
    for (const [key, value] of Object.entries(context)) {
      // Skip functions as they can't be serialized
      if (typeof value === 'function') continue;

      // Rename 'agents' to avoid Prism reserved word
      const varName = key === 'agents' ? 'agentList' : key;

      // Debug logging for parallax object
      if (key === 'parallax' && typeof value === 'object' && value !== null) {
        this.logger.debug(
          {
            parallaxKeys: Object.keys(value),
            hasAgents: 'agents' in value,
            hasAgentList: 'agentList' in value,
          },
          'Processing parallax object'
        );
      }

      const prismValue = toPrismValue(value);
      const line = `${varName} = ${prismValue}`;

      // Log the generated line for debugging
      if (key === 'parallax') {
        this.logger.debug(
          { line: line.substring(0, 200) + '...' },
          'Generated parallax line'
        );
      }

      preamble.push(line);
    }

    // Combine preamble with original script
    const result =
      preamble.length > 0 ? preamble.join('\n') + '\n\n' + script : script;

    // Log first few lines for debugging
    const lines = result.split('\n');
    this.logger.debug(
      {
        firstLines: lines.slice(0, 10).join('\n'),
        totalLines: lines.length,
      },
      'Generated Prism script'
    );

    return result;
  }

  private async runPrismCode(
    script: string,
    instance: RuntimeInstance
  ): Promise<any> {
    try {
      const { runPrism } = require('@prism-lang/core');
      
      // Check if we need enhanced runtime with utilities
      if (this.needsEnhancedRuntime(script)) {
        return await this.runWithEnhancedRuntime(script, instance);
      }

      // Debug: write to file to examine
      try {
        const fs = require('fs');
        fs.writeFileSync('/tmp/prism-debug.txt', script);
      } catch (e) {
        // ignore
      }

      // Use the simplified runPrism API for simple cases
      const result = await runPrism(script);

      // Debug: Log the raw result structure
      this.logger.info({
        resultType: typeof result,
        resultConstructor: result?.constructor?.name,
        resultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
        hasValue: result && typeof result === 'object' ? '_value' in result : false,
        hasConfidence: result && typeof result === 'object' ? '_confidence' in result : false,
      }, 'Raw Prism result');

      // Extract confidence and unwrap ConfidenceValue if needed
      let confidence = 0.5;
      let unwrappedValue = result;

      if (result && typeof result === 'object') {
        // Check if this is a ConfidenceValue wrapper
        if (
          result.constructor &&
          result.constructor.name === 'ConfidenceValue'
        ) {
          // Extract confidence from ConfidenceValue
          confidence = result.confidence ?? result._confidence ?? 0.5;
          // Unwrap the inner value
          unwrappedValue = result.value ?? result._value ?? result;
        } else if ('confidence' in result) {
          confidence = result.confidence;
        } else if ('_confidence' in result) {
          confidence = result._confidence;
        }

        // If the unwrapped value is a Prism ObjectValue, extract its properties
        if (
          unwrappedValue &&
          typeof unwrappedValue === 'object' &&
          unwrappedValue.constructor &&
          unwrappedValue.constructor.name === 'ObjectValue' &&
          'properties' in unwrappedValue
        ) {
          // Convert Prism ObjectValue to plain JS object
          unwrappedValue = this.prismValueToJS(unwrappedValue);
        }
      }

      // Debug: Log what we're returning
      this.logger.info({
        unwrappedValueType: typeof unwrappedValue,
        unwrappedValueKeys: unwrappedValue && typeof unwrappedValue === 'object' ? Object.keys(unwrappedValue) : [],
        confidence,
      }, 'Returning from executePrismScript');

      return {
        value: unwrappedValue,
        confidence,
        instanceId: instance.id,
        executedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        {
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
          script: script.substring(0, 200) + '...',
        },
        'Failed to execute Prism code'
      );
      throw error;
    }
  }

  async injectParallaxContext(script: string): Promise<string> {
    // Just return the script as-is since context injection happens in executePrismScript
    return script;
  }

  getMetrics() {
    return this.pool.getMetrics();
  }

  async shutdown(): Promise<void> {
    await this.pool.shutdown();
  }

  /**
   * Convert Prism runtime values to plain JavaScript values
   */
  private prismValueToJS(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    const typeName = value.constructor?.name;

    switch (typeName) {
      case 'ObjectValue':
        // Convert Prism ObjectValue to plain object
        if (value.properties instanceof Map) {
          const obj: Record<string, any> = {};
          for (const [key, val] of value.properties) {
            obj[key] = this.prismValueToJS(val);
          }
          return obj;
        }
        // If properties is already an object
        if (value.properties && typeof value.properties === 'object') {
          const obj: Record<string, any> = {};
          for (const [key, val] of Object.entries(value.properties)) {
            obj[key] = this.prismValueToJS(val);
          }
          return obj;
        }
        return value.value ?? value;

      case 'ArrayValue':
        // Convert Prism ArrayValue to plain array
        if (Array.isArray(value.elements)) {
          return value.elements.map((el: any) => this.prismValueToJS(el));
        }
        if (Array.isArray(value.value)) {
          return value.value.map((el: any) => this.prismValueToJS(el));
        }
        return value;

      case 'StringValue':
      case 'NumberValue':
      case 'BooleanValue':
        return value.value;

      case 'NullValue':
        return null;

      case 'UndefinedValue':
        return undefined;

      case 'ConfidenceValue':
        // Recursively unwrap confidence values
        return this.prismValueToJS(value.value ?? value._value);

      default:
        // For primitive types or unknown types, return as-is
        if (typeof value !== 'object') {
          return value;
        }
        // If it has a value property, try to extract it
        if ('value' in value && value.value !== value) {
          return this.prismValueToJS(value.value);
        }
        return value;
    }
  }

  private needsEnhancedRuntime(script: string): boolean {
    // Check if script uses advanced features that need enhanced runtime
    return script.includes('confidence.') || 
           script.includes('llm(') ||
           script.includes('average(') ||
           script.includes('now()') ||
           script.includes('synthesize');
  }

  private async runWithEnhancedRuntime(
    script: string,
    _instance: RuntimeInstance
  ): Promise<any> {
    const { createRuntime, parse } = require('@prism-lang/core');
    
    // Create runtime with utility globals
    const runtime = createRuntime({
      globals: {
        // Confidence utilities (as data/config, not functions)
        confidence: {
          // These would return configuration objects that Prism interprets
          from_consistency: (samples: any[]) => ({
            type: 'consistency_check',
            samples: samples,
            method: 'statistical'
          }),
          create_budget: (config: any) => ({
            type: 'confidence_budget',
            min_total: config.min_total || 3.0,
            items: [],
            add: (_items: any[]) => { /* Prism handles this */ },
            met: () => { /* Prism evaluates this */ }
          })
        },
        
        // Helper functions for patterns
        average: (arr: any[]) => {
          if (!Array.isArray(arr) || arr.length === 0) return 0;
          const sum = arr.reduce((a, b) => {
            const aVal = typeof a === 'object' && a._value !== undefined ? a._value : a;
            const bVal = typeof b === 'object' && b._value !== undefined ? b._value : b;
            return aVal + bVal;
          }, 0);
          return sum / arr.length;
        },
        
        // Utility functions
        now: () => Date.now(),
        
        // Synthesis helpers
        synthesize: (results: any[]) => {
          // Simple synthesis - could be made more sophisticated
          if (!results || results.length === 0) return null;
          
          // Find highest confidence result
          return results.reduce((best, current) => {
            const bestConf = best.confidence || 0;
            const currConf = current.confidence || 0;
            return currConf > bestConf ? current : best;
          });
        },
        
        majorityVote: (results: any[]) => {
          if (!results || results.length === 0) return null;
          
          // Group by value and count
          const votes = new Map();
          results.forEach(r => {
            const key = JSON.stringify(r.value || r);
            votes.set(key, (votes.get(key) || 0) + 1);
          });
          
          // Find most common
          let maxVotes = 0;
          let winner = null;
          votes.forEach((count, key) => {
            if (count > maxVotes) {
              maxVotes = count;
              winner = JSON.parse(key);
            }
          });
          
          return winner;
        }
      }
    });
    
    const ast = parse(script);
    return await runtime.execute(ast);
  }
}
