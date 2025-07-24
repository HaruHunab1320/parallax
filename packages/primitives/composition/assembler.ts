/**
 * Pattern Assembler
 * 
 * Converts composed patterns into executable Prism code
 */

import { 
  ComposedPattern, 
  ExecutablePattern,
  Primitive,
  Connection,
  PatternValidation 
} from '../types';
import { PatternValidator } from '../validation/pattern-validator';

export class PatternAssembler {
  private validator: PatternValidator;

  constructor() {
    this.validator = new PatternValidator();
  }
  
  async assemble(pattern: ComposedPattern): Promise<ExecutablePattern> {
    const codeLines: string[] = [];
    
    // Generate header with metadata
    codeLines.push(this.generateHeader(pattern));
    
    // Import required primitives
    codeLines.push(this.generateImports(pattern));
    
    // Generate main pattern function
    codeLines.push(this.generateMainFunction(pattern));
    
    // Generate result handling
    codeLines.push(this.generateResultHandler(pattern));
    
    const code = codeLines.join('\n');
    
    const executablePattern: ExecutablePattern = {
      code,
      primitives: pattern.primitives,
      confidence: pattern.estimatedConfidence,
      metadata: pattern.metadata
    };

    // Validate the generated pattern
    const validation = await this.validator.validatePattern(executablePattern);
    
    if (!validation.isValid) {
      throw new Error(`Generated pattern is invalid: ${validation.errors.join(', ')}`);
    }

    // Log warnings and suggestions
    if (validation.warnings.length > 0) {
      console.warn('Pattern validation warnings:', validation.warnings);
    }
    if (validation.suggestions.length > 0) {
      console.info('Pattern optimization suggestions:', validation.suggestions);
    }
    
    return executablePattern;
  }

  /**
   * Assembles a pattern with validation result
   */
  async assembleWithValidation(pattern: ComposedPattern): Promise<{
    pattern: ExecutablePattern;
    validation: PatternValidation;
  }> {
    const codeLines: string[] = [];
    
    // Generate all parts
    codeLines.push(this.generateHeader(pattern));
    codeLines.push(this.generateImports(pattern));
    codeLines.push(this.generateMainFunction(pattern));
    codeLines.push(this.generateResultHandler(pattern));
    
    const code = codeLines.join('\n');
    
    const executablePattern: ExecutablePattern = {
      code,
      primitives: pattern.primitives,
      confidence: pattern.estimatedConfidence,
      metadata: pattern.metadata
    };

    // Validate the pattern
    const validation = await this.validator.validatePattern(executablePattern);
    
    return {
      pattern: executablePattern,
      validation
    };
  }

  private generateHeader(pattern: ComposedPattern): string {
    return `// Generated Pattern: ${pattern.name}
// Description: ${pattern.description}
// Generated: ${new Date().toISOString()}
// Complexity: ${pattern.complexity}
// Estimated Confidence: ${pattern.estimatedConfidence}

`;
  }

  private generateImports(pattern: ComposedPattern): string {
    const imports: string[] = [];
    
    // Group primitives by category
    const primitivesByCategory = new Map<string, string[]>();
    
    for (const primitiveName of pattern.primitives) {
      const category = this.getPrimitiveCategory(primitiveName);
      if (!primitivesByCategory.has(category)) {
        primitivesByCategory.set(category, []);
      }
      primitivesByCategory.get(category)!.push(primitiveName);
    }
    
    // Generate import statements
    for (const [category, primitives] of primitivesByCategory) {
      const primitiveList = primitives.join(', ');
      imports.push(`import { ${primitiveList} } from "@parallax/primitives/${category}"`);
    }
    
    return imports.join('\n') + '\n\n';
  }

  private generateMainFunction(pattern: ComposedPattern): string {
    const lines: string[] = [];
    
    // Pattern function signature (convert hyphens to camelCase)
    const functionName = pattern.name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    lines.push(`export const ${functionName}Pattern = (config) => {`);
    lines.push(`  return (input) => {`);
    lines.push(`    // Extract configuration`);
    lines.push(`    agents = config.agents || []`);
    lines.push(`    minConfidence = config.minConfidence || ${pattern.metadata.minConfidence || 0.5}`);
    lines.push(`    strategy = config.strategy || "${pattern.metadata.strategy || 'default'}"`);
    lines.push(`    maxRetries = config.maxRetries || 3`);
    lines.push(``);
    
    // Generate primitive invocations based on structure
    const structureCode = this.generateStructureCode(pattern);
    lines.push(...structureCode.map(line => '  ' + line));
    
    lines.push(`  }`);
    lines.push(`}`);
    
    return lines.join('\n');
  }

  private generateStructureCode(pattern: ComposedPattern): string[] {
    const lines: string[] = [];
    const variableMap = new Map<string, string>();
    
    // Process each layer in the structure
    if (pattern.structure && pattern.structure.layers) {
      pattern.structure.layers.forEach((layer: any, layerIndex: number) => {
        lines.push(`  // Layer ${layerIndex + 1}: ${layer.type}`);
        
        layer.primitives.forEach((primitive: any, primitiveIndex: number) => {
          const varName = `${primitive.name}_${layerIndex}_${primitiveIndex}`;
          const code = this.generatePrimitiveCode(
            primitive, 
            varName, 
            layerIndex,
            variableMap,
            pattern
          );
          lines.push(...code);
          variableMap.set(primitive.name, varName);
        });
        
        lines.push(``);
      });
    }
    
    // Handle wrappers (like retry)
    if (pattern.structure && pattern.structure.wrappers) {
      lines.push(`  // Wrappers`);
      pattern.structure.wrappers.forEach((wrapper: any) => {
        const wrapperCode = this.generateWrapperCode(wrapper, variableMap);
        lines.push(...wrapperCode);
      });
    }
    
    // Return final result
    const finalVar = Array.from(variableMap.values()).pop() || 'result';
    lines.push(`  return ${finalVar}`);
    
    return lines;
  }

  private generatePrimitiveCode(
    primitive: any,
    varName: string,
    layerIndex: number,
    variableMap: Map<string, string>,
    pattern: ComposedPattern
  ): string[] {
    const lines: string[] = [];
    
    // Get input from previous layer or initial input
    const inputVar = layerIndex === 0 
      ? 'input' 
      : Array.from(variableMap.values()).slice(-1)[0] || 'input';
    
    switch (primitive.name) {
      case 'parallel':
        lines.push(`  ${varName} = parallel(${primitive.config?.maxConcurrency || 'null'})(agents.map(agent => {`);
        lines.push(`    return { agent: agent, task: ${inputVar} }`);
        lines.push(`  }))`);
        break;
        
      case 'sequential':
        lines.push(`  ${varName} = sequential()(agents.map(agent => {`);
        lines.push(`    return { agent: agent, task: ${inputVar} }`);
        lines.push(`  }))`);
        break;
        
      case 'consensus':
        lines.push(`  ${varName} = consensus(minConfidence)(${inputVar})`);
        break;
        
      case 'voting':
        lines.push(`  ${varName} = voting(strategy)(${inputVar})`);
        break;
        
      case 'threshold':
        lines.push(`  ${varName} = threshold(minConfidence)(${inputVar})`);
        break;
        
      case 'retry':
        lines.push(`  ${varName} = retry(maxRetries, "exponential")(${inputVar})`);
        break;
        
      case 'fallback':
        lines.push(`  ${varName} = fallback(config.fallback || "default")(${inputVar})`);
        break;
        
      case 'escalate':
        lines.push(`  ${varName} = escalate(config.escalationPath || "supervisor")(${inputVar})`);
        break;
        
      default:
        // Generic primitive invocation
        lines.push(`  ${varName} = ${primitive.name}()(${inputVar})`);
    }
    
    return lines;
  }

  private generateWrapperCode(
    wrapper: any,
    variableMap: Map<string, string>
  ): string[] {
    const lines: string[] = [];
    const wrappedVar = Array.from(variableMap.values()).pop() || 'result';
    
    switch (wrapper.name) {
      case 'retry':
        lines.push(`  // Wrap entire pattern in retry logic`);
        lines.push(`  finalResult = retry(maxRetries, "exponential")(() => ${wrappedVar})`);
        variableMap.set('final', 'finalResult');
        break;
        
      case 'timeout':
        lines.push(`  // Wrap with timeout`);
        lines.push(`  finalResult = timeout(config.timeout || 30000)(() => ${wrappedVar})`);
        variableMap.set('final', 'finalResult');
        break;
    }
    
    return lines;
  }

  private generateResultHandler(pattern: ComposedPattern): string {
    return `
// Usage example:
// const pattern = ${pattern.name}Pattern(input, {
//   agents: [agent1, agent2, agent3],
//   minConfidence: ${pattern.metadata.minConfidence || 0.7},
//   strategy: "${pattern.metadata.strategy || 'majority'}"
// })
`;
  }

  private getPrimitiveCategory(primitiveName: string): string {
    // Map primitive names to their categories
    const categoryMap: Record<string, string> = {
      // Execution
      'parallel': 'execution',
      'sequential': 'execution',
      'race': 'execution',
      'batch': 'execution',
      
      // Aggregation
      'consensus': 'aggregation',
      'voting': 'aggregation',
      'merge': 'aggregation',
      'reduce': 'aggregation',
      
      // Confidence
      'threshold': 'confidence',
      'transform': 'confidence',
      
      // Control
      'retry': 'control',
      'fallback': 'control',
      'escalate': 'control',
      'circuit': 'control',
      'timeout': 'control',
      'cache': 'control',
      
      // Coordination
      'delegate': 'coordination',
      'prioritize': 'coordination',
      'quorum': 'coordination',
      'synchronize': 'coordination',
      
      // Transformation
      'map': 'transformation',
      'partition': 'transformation',
      'sample': 'transformation',
      
      // Workflow
      'pipeline': 'workflow',
      'dependency': 'workflow',
      
      // Other
      'schedule': 'temporal',
      'pool': 'resource',
      'saga': 'transaction',
      'pubsub': 'event',
      'stream': 'event',
      'plan': 'goal'
    };
    
    return categoryMap[primitiveName] || 'utils';
  }
}

// Helper function to create a simple pattern from requirements
export async function createPattern(requirements: {
  goal: string;
  strategy?: string;
  minConfidence?: number;
}): Promise<ExecutablePattern> {
  const { PatternComposer } = await import('./composer');
  const composer = new PatternComposer();
  const assembler = new PatternAssembler();
  
  // Compose pattern from requirements
  const composedPattern = await composer.composePattern(requirements);
  
  // Assemble into executable code
  return assembler.assemble(composedPattern);
}