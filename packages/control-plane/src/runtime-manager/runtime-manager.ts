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
      this.logger.debug({ instanceId: instance.id }, 'Runtime instance released');
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
        require('fs').writeFileSync('/tmp/enhanced-script.prism', enhancedScript);
        this.logger.info('Saved enhanced script to /tmp/enhanced-script.prism');
      } catch (e) {
        // ignore
      }
      
      const result = await this.runPrismCode(enhancedScript, instance);
      
      return result;
    } catch (error) {
      this.logger.error({ instanceId: instance.id, error }, 'Script execution failed');
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
      if (value === null) return 'null';  // Prism 1.0.11 supports null
      if (value === undefined) return 'null';  // Convert undefined to null
      if (typeof value === 'string') {
        // Escape quotes and newlines
        return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
      }
      if (typeof value === 'number') return value.toString();
      if (typeof value === 'boolean') return value.toString();
      if (Array.isArray(value)) {
        const elements = value.map(v => toPrismValue(v, depth + 1)).join(', ');
        return `[${elements}]`;
      }
      if (typeof value === 'object') {
        const props = Object.entries(value)
          .map(([k, v]) => {
            // Rename 'agents' key to 'agentList' in nested objects too
            const key = k === 'agents' ? 'agentList' : k;
            return `${key}: ${toPrismValue(v, depth + 1)}`;
          })
          .join(', ');
        return `{${props}}`;
      }
      return 'null';  // Default to null for unknown types
    };
    
    // Inject all context variables
    for (const [key, value] of Object.entries(context)) {
      // Skip functions as they can't be serialized
      if (typeof value === 'function') continue;
      
      // Rename 'agents' to avoid Prism reserved word
      const varName = key === 'agents' ? 'agentList' : key;
      
      // Debug logging for parallax object
      if (key === 'parallax' && typeof value === 'object' && value !== null) {
        this.logger.debug({ 
          parallaxKeys: Object.keys(value),
          hasAgents: 'agents' in value,
          hasAgentList: 'agentList' in value 
        }, 'Processing parallax object');
      }
      
      const prismValue = toPrismValue(value);
      const line = `${varName} = ${prismValue}`;
      
      // Log the generated line for debugging
      if (key === 'parallax') {
        this.logger.debug({ line: line.substring(0, 200) + '...' }, 'Generated parallax line');
      }
      
      preamble.push(line);
    }
    
    // Combine preamble with original script
    const result = preamble.length > 0 
      ? preamble.join('\n') + '\n\n' + script
      : script;
      
    // Log first few lines for debugging
    const lines = result.split('\n');
    this.logger.debug({ 
      firstLines: lines.slice(0, 10).join('\n'),
      totalLines: lines.length 
    }, 'Generated Prism script');
    
    return result;
  }

  private async runPrismCode(
    script: string, 
    instance: RuntimeInstance
  ): Promise<any> {
    try {
      const { runPrism } = require('prism-uncertainty');
      
      // Debug: write to file to examine
      try {
        const fs = require('fs');
        fs.writeFileSync('/tmp/prism-debug.txt', script);
        
        // Also check for null
        if (script.includes('null')) {
          console.error('WARNING: Script contains "null"');
          const lines = script.split('\n');
          lines.forEach((line, idx) => {
            if (line.includes('null')) {
              console.error(`Line ${idx + 1}: ${line}`);
            }
          });
        }
      } catch (e) {
        // ignore
      }
      
      // Execute the script
      const result = await runPrism(script);
      
      // Extract confidence if available
      let confidence = 0.5;
      if (result && typeof result === 'object') {
        if ('confidence' in result) {
          confidence = result.confidence;
        } else if ('_confidence' in result) {
          confidence = result._confidence;
        } else if (result.constructor && result.constructor.name === 'ConfidenceValue') {
          // Handle Prism's ConfidenceValue type
          confidence = result._confidence || 0.5;
        }
      }
      
      return {
        value: result,
        confidence,
        instanceId: instance.id,
        executedAt: new Date(),
      };
    } catch (error) {
      this.logger.error({ 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        script: script.substring(0, 200) + '...' 
      }, 'Failed to execute Prism code');
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
}