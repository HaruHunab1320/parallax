/**
 * Pattern-Aware Wrapper
 * 
 * Enhances agents with automatic pattern composition capabilities
 */

import { ParallaxAgent, AgentResponse } from '@parallax/sdk-typescript';
import { PatternComposer, PatternAssembler, OrchestrationRequirements } from '@parallax/primitives';

export interface PatternAwareOptions {
  autoCompose?: boolean;
  cachePatterns?: boolean;
  validatePatterns?: boolean;
}

export class PatternAwareWrapper {
  private agent: ParallaxAgent;
  private composer: PatternComposer;
  private assembler: PatternAssembler;
  private patternCache: Map<string, any>;
  private options: PatternAwareOptions;

  constructor(agent: ParallaxAgent, options: PatternAwareOptions = {}) {
    this.agent = agent;
    this.composer = new PatternComposer();
    this.assembler = new PatternAssembler();
    this.patternCache = new Map();
    this.options = {
      autoCompose: true,
      cachePatterns: true,
      validatePatterns: true,
      ...options
    };
  }

  /**
   * Enhance the agent with pattern awareness
   */
  enhance(): ParallaxAgent {
    const wrapper = this;
    const enhancedAgent = Object.create(this.agent);

    // Override the execute method
    enhancedAgent.execute = async function(task: any) {
      // Check if task has orchestration needs
      if (task.orchestrationNeeds && wrapper.options.autoCompose) {
        const pattern = await wrapper.composePattern(task.orchestrationNeeds);
        
        // Add pattern to task context
        task._generatedPattern = pattern;
        task._patternMetadata = {
          composed: true,
          timestamp: new Date().toISOString(),
          requirements: task.orchestrationNeeds
        };
      }

      // Execute original agent logic
      const result = await wrapper.agent.analyze(task.task || task, task.data);
      
      // Enhance result with pattern info
      if (task._generatedPattern) {
        return {
          ...result,
          value: {
            ...result.value,
            pattern: task._generatedPattern,
            composition: task._patternMetadata
          }
        };
      }

      return result;
    };

    // Add pattern-specific methods
    enhancedAgent.composePattern = async (requirements: OrchestrationRequirements) => {
      return wrapper.composePattern(requirements);
    };

    enhancedAgent.getPatternCache = () => wrapper.patternCache;

    return enhancedAgent;
  }

  /**
   * Compose a pattern from requirements
   */
  private async composePattern(requirements: OrchestrationRequirements): Promise<any> {
    // Check cache first
    const cacheKey = this.getCacheKey(requirements);
    if (this.options.cachePatterns && this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey);
    }

    try {
      // Compose pattern
      const composedPattern = await this.composer.composePattern(requirements);
      
      // Assemble into executable code
      let executablePattern;
      if (this.options.validatePatterns) {
        const { pattern, validation } = await this.assembler.assembleWithValidation(composedPattern);
        
        if (!validation.isValid) {
          throw new Error(`Pattern validation failed: ${validation.errors.join(', ')}`);
        }
        
        executablePattern = pattern;
      } else {
        executablePattern = await this.assembler.assemble(composedPattern);
      }

      // Cache the result
      if (this.options.cachePatterns) {
        this.patternCache.set(cacheKey, {
          pattern: executablePattern,
          composed: composedPattern,
          timestamp: new Date()
        });
      }

      return executablePattern;

    } catch (error) {
      console.error('Pattern composition failed:', error);
      return null;
    }
  }

  /**
   * Generate cache key from requirements
   */
  private getCacheKey(requirements: OrchestrationRequirements): string {
    return JSON.stringify({
      goal: requirements.goal,
      strategy: requirements.strategy,
      minConfidence: requirements.minConfidence
    });
  }
}

/**
 * Decorator for making agents pattern-aware
 */
export function patternAware(options?: PatternAwareOptions) {
  return function(target: any) {
    const originalConstructor = target;

    const newConstructor: any = function(...args: any[]) {
      const instance = new originalConstructor(...args);
      const wrapper = new PatternAwareWrapper(instance, options);
      return wrapper.enhance();
    };

    newConstructor.prototype = originalConstructor.prototype;
    return newConstructor;
  };
}

/**
 * Helper function to create pattern-aware agent
 */
export function makePatternAware(
  agent: ParallaxAgent, 
  options?: PatternAwareOptions
): ParallaxAgent {
  const wrapper = new PatternAwareWrapper(agent, options);
  return wrapper.enhance();
}