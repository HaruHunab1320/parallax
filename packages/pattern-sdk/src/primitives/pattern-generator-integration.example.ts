import { PrimitiveLoader } from './primitive-loader';
import type { LoadedPrimitive, PrimitiveMetadata } from './primitive-loader';

/**
 * Example showing how the pattern generator can integrate with the primitive loader
 */
export class PatternGeneratorWithPrimitives {
  private loader: PrimitiveLoader;
  private primitives: Map<string, LoadedPrimitive> = new Map();
  
  constructor() {
    this.loader = new PrimitiveLoader();
  }
  
  /**
   * Initialize the generator by loading all primitives
   */
  async initialize(): Promise<void> {
    this.primitives = await this.loader.loadAll();
    console.log(`Initialized with ${this.primitives.size} primitives`);
  }
  
  /**
   * Generate a pattern based on requirements
   */
  generatePattern(requirements: {
    tasks: string[];
    strategy: 'parallel' | 'sequential' | 'race';
    needsConsensus?: boolean;
    needsRetry?: boolean;
    confidenceThreshold?: number;
  }): string {
    const patterns: string[] = [];
    
    // Get the execution primitive based on strategy
    const executionPrimitive = this.loader.getPrimitive(requirements.strategy);
    if (!executionPrimitive) {
      throw new Error(`Unknown execution strategy: ${requirements.strategy}`);
    }
    
    // Start with the execution pattern
    patterns.push(`// Generated pattern using ${requirements.strategy} execution`);
    patterns.push(`import { ${requirements.strategy} } from '@parallax/primitives/execution/${requirements.strategy}';`);
    
    // Add retry if needed
    if (requirements.needsRetry) {
      const retryPrimitive = this.loader.getPrimitive('retry');
      if (retryPrimitive) {
        patterns.push(`import { retry } from '@parallax/primitives/control/retry';`);
      }
    }
    
    // Add consensus if needed
    if (requirements.needsConsensus) {
      const consensusPrimitive = this.loader.getPrimitive('consensus');
      if (consensusPrimitive) {
        patterns.push(`import { consensus } from '@parallax/primitives/aggregation/consensus';`);
      }
    }
    
    // Add confidence threshold if specified
    if (requirements.confidenceThreshold) {
      const thresholdPrimitive = this.loader.getPrimitive('threshold');
      if (thresholdPrimitive) {
        patterns.push(`import { threshold } from '@parallax/primitives/confidence/threshold';`);
      }
    }
    
    patterns.push('');
    patterns.push('export const generatedPattern = () => {');
    
    // Build the pattern composition
    const tasks = requirements.tasks.map(t => `'${t}'`).join(', ');
    
    if (requirements.needsRetry) {
      patterns.push(`  const withRetry = retry(3, { backoff: 'exponential' });`);
    }
    
    patterns.push(`  const tasks = [${tasks}];`);
    patterns.push('');
    
    // Apply execution strategy
    patterns.push(`  const execution = ${requirements.strategy}()(tasks);`);
    
    // Apply consensus if needed
    if (requirements.needsConsensus) {
      patterns.push(`  const withConsensus = consensus()(execution);`);
    }
    
    // Apply threshold if needed
    if (requirements.confidenceThreshold) {
      patterns.push(`  const withThreshold = threshold(${requirements.confidenceThreshold})(${requirements.needsConsensus ? 'withConsensus' : 'execution'});`);
    }
    
    patterns.push('');
    patterns.push(`  return ${requirements.confidenceThreshold ? 'withThreshold' : requirements.needsConsensus ? 'withConsensus' : 'execution'};`);
    patterns.push('};');
    
    return patterns.join('\n');
  }
  
  /**
   * Suggest primitives based on requirements
   */
  suggestPrimitives(requirements: {
    needsParallelism?: boolean;
    needsSequencing?: boolean;
    needsErrorHandling?: boolean;
    needsCoordination?: boolean;
    needsTransformation?: boolean;
  }): PrimitiveMetadata[] {
    const suggestions: PrimitiveMetadata[] = [];
    
    if (requirements.needsParallelism) {
      const parallel = this.loader.getPrimitiveMetadata('parallel');
      if (parallel) suggestions.push(parallel);
      
      const race = this.loader.getPrimitiveMetadata('race');
      if (race) suggestions.push(race);
    }
    
    if (requirements.needsSequencing) {
      const sequential = this.loader.getPrimitiveMetadata('sequential');
      if (sequential) suggestions.push(sequential);
      
      const pipeline = this.loader.getPrimitiveMetadata('pipeline');
      if (pipeline) suggestions.push(pipeline);
    }
    
    if (requirements.needsErrorHandling) {
      const retry = this.loader.getPrimitiveMetadata('retry');
      if (retry) suggestions.push(retry);
      
      const fallback = this.loader.getPrimitiveMetadata('fallback');
      if (fallback) suggestions.push(fallback);
      
      const circuit = this.loader.getPrimitiveMetadata('circuit');
      if (circuit) suggestions.push(circuit);
    }
    
    if (requirements.needsCoordination) {
      const delegate = this.loader.getPrimitiveMetadata('delegate');
      if (delegate) suggestions.push(delegate);
      
      const synchronize = this.loader.getPrimitiveMetadata('synchronize');
      if (synchronize) suggestions.push(synchronize);
    }
    
    if (requirements.needsTransformation) {
      const map = this.loader.getPrimitiveMetadata('map');
      if (map) suggestions.push(map);
      
      const partition = this.loader.getPrimitiveMetadata('partition');
      if (partition) suggestions.push(partition);
    }
    
    return suggestions;
  }
  
  /**
   * Validate that a pattern uses valid primitives
   */
  validatePatternPrimitives(patternCode: string): {
    valid: boolean;
    usedPrimitives: string[];
    unknownPrimitives: string[];
  } {
    // Extract import statements
    const importRegex = /import\s*{\s*([^}]+)\s*}\s*from\s*['"]@parallax\/primitives/g;
    const usedPrimitives: string[] = [];
    const unknownPrimitives: string[] = [];
    
    let match;
    while ((match = importRegex.exec(patternCode)) !== null) {
      const imports = match[1].split(',').map(i => i.trim());
      for (const imp of imports) {
        if (this.loader.hasPrimitive(imp)) {
          usedPrimitives.push(imp);
        } else {
          unknownPrimitives.push(imp);
        }
      }
    }
    
    return {
      valid: unknownPrimitives.length === 0,
      usedPrimitives,
      unknownPrimitives
    };
  }
}

// Example usage
async function demonstrateIntegration() {
  const generator = new PatternGeneratorWithPrimitives();
  await generator.initialize();
  
  // Generate a pattern
  console.log('=== Generated Pattern ===');
  const pattern = generator.generatePattern({
    tasks: ['fetchData', 'processData', 'saveResults'],
    strategy: 'parallel',
    needsConsensus: true,
    needsRetry: true,
    confidenceThreshold: 0.8
  });
  console.log(pattern);
  console.log('');
  
  // Suggest primitives
  console.log('=== Suggested Primitives ===');
  const suggestions = generator.suggestPrimitives({
    needsParallelism: true,
    needsErrorHandling: true
  });
  for (const primitive of suggestions) {
    console.log(`- ${primitive.name}: ${primitive.description}`);
  }
  console.log('');
  
  // Validate a pattern
  console.log('=== Pattern Validation ===');
  const validation = generator.validatePatternPrimitives(pattern);
  console.log(`Valid: ${validation.valid}`);
  console.log(`Used primitives: ${validation.usedPrimitives.join(', ')}`);
  if (validation.unknownPrimitives.length > 0) {
    console.log(`Unknown primitives: ${validation.unknownPrimitives.join(', ')}`);
  }
}

// Run demo if executed directly
if (require.main === module) {
  demonstrateIntegration().catch(console.error);
}