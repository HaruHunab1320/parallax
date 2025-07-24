/**
 * Enhanced Runtime Manager with Module Support
 * 
 * Updates Parallax's runtime manager to support Prism modules
 */

import { createPrismRuntime, parse } from '@prism-lang/core';
import { Logger } from 'pino';
import * as fs from 'fs';
import * as path from 'path';

export class EnhancedRuntimeManager {
  private runtime: any;
  private logger: Logger;
  private primitivesPath: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.primitivesPath = path.join(__dirname, '../../primitives');
    
    // Initialize runtime with module resolver
    this.runtime = createPrismRuntime({
      moduleResolver: this.createModuleResolver()
    });
  }

  /**
   * Creates a module resolver for primitives
   */
  private createModuleResolver() {
    return async (modulePath: string, baseDir?: string) => {
      this.logger.debug({ modulePath, baseDir }, 'Resolving module');
      
      // Handle @parallax/primitives imports
      if (modulePath.startsWith('@parallax/primitives/')) {
        const primitivePath = modulePath.replace('@parallax/primitives/', '');
        const fullPath = path.join(this.primitivesPath, primitivePath);
        const filePath = fullPath.endsWith('.prism') ? fullPath : `${fullPath}.prism`;
        
        try {
          const source = fs.readFileSync(filePath, 'utf8');
          this.logger.debug({ filePath }, 'Loaded primitive module');
          return { source, path: filePath };
        } catch (error) {
          this.logger.error({ error, filePath }, 'Failed to load primitive');
          throw new Error(`Primitive not found: ${modulePath}`);
        }
      }
      
      // Handle relative imports
      if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
        const resolveBase = baseDir || this.primitivesPath;
        const resolvedPath = path.resolve(resolveBase, modulePath);
        const filePath = resolvedPath.endsWith('.prism') ? resolvedPath : `${resolvedPath}.prism`;
        
        try {
          const source = fs.readFileSync(filePath, 'utf8');
          this.logger.debug({ filePath }, 'Loaded relative module');
          return { source, path: filePath };
        } catch (error) {
          this.logger.error({ error, filePath }, 'Failed to load module');
          throw new Error(`Module not found: ${modulePath}`);
        }
      }
      
      // Handle patterns directory imports
      if (modulePath.startsWith('patterns/')) {
        const patternPath = path.join(process.cwd(), modulePath);
        const filePath = patternPath.endsWith('.prism') ? patternPath : `${patternPath}.prism`;
        
        try {
          const source = fs.readFileSync(filePath, 'utf8');
          return { source, path: filePath };
        } catch (error) {
          throw new Error(`Pattern not found: ${modulePath}`);
        }
      }
      
      throw new Error(`Cannot resolve module: ${modulePath}`);
    };
  }

  /**
   * Execute Prism script with module support
   */
  async executePrismScript(script: string, context?: any): Promise<any> {
    this.logger.debug({ scriptLength: script.length }, 'Executing Prism script');
    
    try {
      // Inject context if provided
      const enhancedScript = context ? this.injectContext(script, context) : script;
      
      // Parse the script first to check for syntax errors
      const ast = parse(enhancedScript);
      
      // Execute with module support
      const result = await this.runtime.execute(ast);
      
      // Extract value and confidence
      let value = result;
      let confidence = 0.5;
      
      if (result && typeof result === 'object') {
        if ('value' in result && 'confidence' in result) {
          value = result.value;
          confidence = result.confidence._value || result.confidence;
        } else if (result.type === 'confident') {
          value = result.value;
          confidence = result.confidence?._value || 0.5;
        }
      }
      
      return {
        value,
        confidence,
        executedAt: new Date()
      };
      
    } catch (error) {
      this.logger.error({ error }, 'Script execution failed');
      throw error;
    }
  }

  /**
   * Execute a composed pattern
   */
  async executeComposedPattern(patternCode: string, input: any, config: any): Promise<any> {
    this.logger.info({ config }, 'Executing composed pattern');
    
    // Wrap the pattern code to execute it
    const executionScript = `
${patternCode}

// Extract the pattern function name from exports
// Assuming pattern follows naming convention: patternNamePattern
patternFunction = ${this.extractPatternFunctionName(patternCode)}

// Execute the pattern
configuredPattern = patternFunction(${JSON.stringify(config)})
result = configuredPattern(${JSON.stringify(input)})

result
`;
    
    return this.executePrismScript(executionScript);
  }

  /**
   * Execute pattern with primitives
   */
  async executeWithPrimitives(script: string, primitives: string[]): Promise<any> {
    this.logger.info({ primitives }, 'Executing with specific primitives');
    
    // Generate import statements
    const imports = this.generateImports(primitives);
    
    // Combine imports with script
    const fullScript = `${imports}\n\n${script}`;
    
    return this.executePrismScript(fullScript);
  }

  /**
   * Inject context variables into script
   */
  private injectContext(script: string, context: any): string {
    const contextLines: string[] = [];
    
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'function') continue;
      
      const prismValue = this.toPrismValue(value);
      contextLines.push(`${key} = ${prismValue}`);
    }
    
    return contextLines.length > 0 
      ? `${contextLines.join('\n')}\n\n${script}`
      : script;
  }

  /**
   * Convert JS value to Prism syntax
   */
  private toPrismValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'null';
    if (typeof value === 'string') {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value.toString();
    if (Array.isArray(value)) {
      const elements = value.map(v => this.toPrismValue(v)).join(', ');
      return `[${elements}]`;
    }
    if (typeof value === 'object') {
      const props = Object.entries(value)
        .map(([k, v]) => `${k}: ${this.toPrismValue(v)}`)
        .join(', ');
      return `{${props}}`;
    }
    return 'null';
  }

  /**
   * Generate import statements for primitives
   */
  private generateImports(primitives: string[]): string {
    const imports: Map<string, string[]> = new Map();
    
    // Group primitives by category
    for (const primitive of primitives) {
      const category = this.getPrimitiveCategory(primitive);
      if (!imports.has(category)) {
        imports.set(category, []);
      }
      imports.get(category)!.push(primitive);
    }
    
    // Generate import statements
    const importStatements: string[] = [];
    for (const [category, prims] of imports) {
      const primList = prims.join(', ');
      importStatements.push(
        `import { ${primList} } from "@parallax/primitives/${category}"`
      );
    }
    
    return importStatements.join('\n');
  }

  /**
   * Get primitive category
   */
  private getPrimitiveCategory(primitive: string): string {
    const categoryMap: Record<string, string> = {
      'parallel': 'execution/parallel.prism',
      'sequential': 'execution/sequential.prism',
      'race': 'execution/race.prism',
      'batch': 'execution/batch.prism',
      'consensus': 'aggregation/consensus.prism',
      'voting': 'aggregation/voting.prism',
      'merge': 'aggregation/merge.prism',
      'reduce': 'aggregation/reduce.prism',
      'threshold': 'confidence/threshold.prism',
      'transform': 'confidence/transform.prism',
      'retry': 'control/retry.prism',
      'fallback': 'control/fallback.prism',
      'circuit': 'control/circuit.prism',
      'cache': 'control/cache.prism',
      'timeout': 'control/timeout.prism',
      'escalate': 'control/escalate.prism'
    };
    
    return categoryMap[primitive] || `utils/${primitive}.prism`;
  }

  /**
   * Extract pattern function name from code
   */
  private extractPatternFunctionName(code: string): string {
    const match = code.match(/export const (\w+Pattern)/);
    return match ? match[1] : 'pattern';
  }

  /**
   * Get runtime metrics
   */
  getMetrics() {
    return {
      runtimeActive: true,
      moduleSystemEnabled: true,
      primitivesPath: this.primitivesPath
    };
  }
}