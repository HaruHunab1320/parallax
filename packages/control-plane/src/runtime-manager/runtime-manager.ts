import { PrismRuntimePool } from './prism-runtime-pool';
import { RuntimeConfig, RuntimeInstance } from './types';
import { Logger } from 'pino';
import { Prism, runPrism } from 'prism-uncertainty';

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
      
      // TODO: Integrate with actual Prism runtime
      // For now, return mock result
      const result = await this.runPrismCode(script, context, instance);
      
      return result;
    } catch (error) {
      this.logger.error({ instanceId: instance.id, error }, 'Script execution failed');
      throw error;
    } finally {
      this.pool.releaseInstance(instance.id);
    }
  }

  private async runPrismCode(
    script: string, 
    context: any, 
    instance: RuntimeInstance
  ): Promise<any> {
    try {
      // Create a new Prism instance
      const _prism = new Prism();
      
      // Set context variables if provided
      const prismContext = context || {};
      
      // Execute the Prism script
      const result = await runPrism(script, prismContext);
      
      // Extract confidence if available
      let confidence = 0.5;
      if (result && typeof result === 'object') {
        if ('confidence' in result) {
          confidence = result.confidence;
        } else if ('_confidence' in result) {
          confidence = result._confidence;
        }
      }
      
      return {
        value: result,
        confidence,
        instanceId: instance.id,
        executedAt: new Date(),
      };
    } catch (error) {
      this.logger.error({ error, script }, 'Failed to execute Prism code');
      throw error;
    }
  }

  async injectParallaxContext(script: string): Promise<string> {
    // Inject Parallax-specific functions and context into Prism scripts
    const contextCode = `
      // Parallax context injection
      const parallax = {
        agents: globalThis.__parallaxAgents || [],
        patterns: globalThis.__parallaxPatterns || {},
        confidence: {
          track: (value, confidence) => ({ value, confidence }),
          propagate: (results) => results.map(r => r.confidence)
        }
      };
      
      // Helper functions
      const highConfidenceAgreement = (results) => {
        const highConf = results.filter(r => r.confidence > 0.8);
        return highConf.length > results.length * 0.6;
      };
      
      const parallel = async (tasks) => {
        return Promise.all(tasks);
      };
    `;

    return contextCode + '\n\n' + script;
  }

  getMetrics() {
    return this.pool.getMetrics();
  }

  async shutdown(): Promise<void> {
    await this.pool.shutdown();
  }
}