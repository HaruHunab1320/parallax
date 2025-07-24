/**
 * Pattern Composition Engine
 * 
 * Takes orchestration requirements and composes primitives into patterns
 */

import { 
  OrchestrationRequirements, 
  RequirementsAnalysis,
  Primitive,
  ComposedPattern,
  Composition,
  Connection
} from '../types';

export class PatternComposer {
  private primitiveRegistry: Map<string, Primitive>;

  constructor() {
    this.primitiveRegistry = this.initializePrimitives();
  }

  private initializePrimitives(): Map<string, Primitive> {
    const primitives = new Map<string, Primitive>();

    // Execution primitives
    primitives.set('parallel', {
      name: 'parallel',
      type: 'execution',
      description: 'Execute multiple operations concurrently',
      inputs: ['tasks: Task[]', 'maxConcurrency?: number'],
      outputs: ['results: Result[]'],
      confidence: 'propagates-minimum'
    });

    primitives.set('sequential', {
      name: 'sequential',
      type: 'execution', 
      description: 'Execute operations in sequence',
      inputs: ['tasks: Task[]'],
      outputs: ['results: Result[]'],
      confidence: 'propagates-chain'
    });

    primitives.set('race', {
      name: 'race',
      type: 'execution',
      description: 'Return first completed result',
      inputs: ['tasks: Task[]'],
      outputs: ['result: Result'],
      confidence: 'from-winner'
    });

    // Aggregation primitives
    primitives.set('consensus', {
      name: 'consensus',
      type: 'aggregation',
      description: 'Build consensus from multiple results',
      inputs: ['results: Result[]', 'threshold: number'],
      outputs: ['consensus: Result'],
      confidence: 'calculated-from-agreement'
    });

    primitives.set('voting', {
      name: 'voting',
      type: 'aggregation',
      description: 'Aggregate through voting',
      inputs: ['results: Result[]', 'strategy: string'],
      outputs: ['winner: Result'],
      confidence: 'from-vote-weight'
    });

    primitives.set('merge', {
      name: 'merge',
      type: 'aggregation',
      description: 'Merge multiple results',
      inputs: ['results: Result[]', 'strategy: string'],
      outputs: ['merged: Result'],
      confidence: 'average'
    });

    // Confidence primitives
    primitives.set('threshold', {
      name: 'threshold',
      type: 'confidence',
      description: 'Filter by confidence threshold',
      inputs: ['input: Result', 'threshold: number'],
      outputs: ['output: Result?'],
      confidence: 'pass-through-or-null'
    });

    primitives.set('transform', {
      name: 'transform',
      type: 'confidence',
      description: 'Transform confidence values',
      inputs: ['input: Result', 'transformation: string'],
      outputs: ['output: Result'],
      confidence: 'transformed'
    });

    // Control primitives
    primitives.set('retry', {
      name: 'retry',
      type: 'control',
      description: 'Retry failed operations',
      inputs: ['operation: Task', 'maxRetries: number', 'strategy: string'],
      outputs: ['result: Result'],
      confidence: 'from-successful-attempt'
    });

    primitives.set('fallback', {
      name: 'fallback',
      type: 'control',
      description: 'Fallback to alternative',
      inputs: ['primary: Task', 'fallback: Task'],
      outputs: ['result: Result'],
      confidence: 'from-used-path'
    });

    primitives.set('escalate', {
      name: 'escalate',
      type: 'control',
      description: 'Escalate to higher authority',
      inputs: ['input: Result', 'escalationPath: string'],
      outputs: ['resolved: Result'],
      confidence: 'from-escalation-handler'
    });

    primitives.set('circuit', {
      name: 'circuit',
      type: 'control',
      description: 'Circuit breaker pattern',
      inputs: ['operation: Task', 'threshold: number'],
      outputs: ['result: Result'],
      confidence: 'based-on-circuit-state'
    });

    return primitives;
  }

  async composePattern(requirements: OrchestrationRequirements): Promise<ComposedPattern> {
    // 1. Analyze requirements
    const analysis = await this.analyzeRequirements(requirements);
    
    // 2. Select appropriate primitives
    const selectedPrimitives = this.selectPrimitives(analysis);
    
    // 3. Design composition structure
    const structure = this.designComposition(selectedPrimitives, requirements);
    
    // 4. Generate connections between primitives
    const connections = this.generateConnections(structure);
    
    // 5. Assemble into pattern
    return this.assemblePattern({
      primitives: selectedPrimitives,
      structure,
      connections,
      metadata: this.generateMetadata(requirements)
    });
  }

  private async analyzeRequirements(requirements: OrchestrationRequirements): Promise<RequirementsAnalysis> {
    const analysis: RequirementsAnalysis = {
      needsParallelism: false,
      needsSequencing: false,
      needsConsensus: false,
      needsAggregation: false,
      hasThreshold: false,
      needsBranching: false,
      needsRetry: false,
      needsFallback: false,
      needsEscalation: false,
      confidenceRequirement: requirements.minConfidence || 0.5,
      taskCount: 1,
      complexityScore: 0
    };

    // Analyze goal keywords
    const goalLower = requirements.goal.toLowerCase();
    
    // Execution patterns
    if (goalLower.includes('parallel') || goalLower.includes('concurrent') || 
        goalLower.includes('simultaneously')) {
      analysis.needsParallelism = true;
    }
    if (goalLower.includes('sequential') || goalLower.includes('ordered') || 
        goalLower.includes('step')) {
      analysis.needsSequencing = true;
    }

    // Aggregation patterns
    if (goalLower.includes('consensus') || goalLower.includes('agreement')) {
      analysis.needsConsensus = true;
      analysis.needsAggregation = true;
    }
    if (goalLower.includes('vote') || goalLower.includes('voting')) {
      analysis.needsAggregation = true;
    }

    // Reliability patterns
    if (goalLower.includes('retry') || goalLower.includes('resilient')) {
      analysis.needsRetry = true;
    }
    if (goalLower.includes('fallback') || goalLower.includes('backup')) {
      analysis.needsFallback = true;
    }
    if (goalLower.includes('escalate') || goalLower.includes('supervisor')) {
      analysis.needsEscalation = true;
    }

    // Confidence handling
    if (requirements.minConfidence && requirements.minConfidence > 0.5) {
      analysis.hasThreshold = true;
    }

    // Strategy analysis
    if (requirements.strategy) {
      const strategyLower = requirements.strategy.toLowerCase();
      if (strategyLower.includes('multi') || strategyLower.includes('multiple')) {
        analysis.taskCount = 3; // Default for multi-agent
        analysis.needsAggregation = true;
      }
    }

    // Calculate complexity score
    analysis.complexityScore = this.calculateComplexity(analysis);

    return analysis;
  }

  private selectPrimitives(analysis: RequirementsAnalysis): Primitive[] {
    const selected: Primitive[] = [];

    // Select execution pattern
    if (analysis.needsParallelism) {
      selected.push(this.primitiveRegistry.get('parallel')!);
    } else if (analysis.needsSequencing) {
      selected.push(this.primitiveRegistry.get('sequential')!);
    } else if (analysis.taskCount > 1) {
      // Default to parallel for multiple tasks
      selected.push(this.primitiveRegistry.get('parallel')!);
    }

    // Select aggregation pattern
    if (analysis.needsConsensus) {
      selected.push(this.primitiveRegistry.get('consensus')!);
    } else if (analysis.needsAggregation) {
      selected.push(this.primitiveRegistry.get('voting')!);
    }

    // Add confidence handling
    if (analysis.hasThreshold) {
      selected.push(this.primitiveRegistry.get('threshold')!);
    }

    // Add reliability patterns
    if (analysis.needsRetry) {
      selected.push(this.primitiveRegistry.get('retry')!);
    }
    if (analysis.needsFallback) {
      selected.push(this.primitiveRegistry.get('fallback')!);
    }
    if (analysis.needsEscalation) {
      selected.push(this.primitiveRegistry.get('escalate')!);
    }

    return selected;
  }

  private designComposition(
    primitives: Primitive[], 
    requirements: OrchestrationRequirements
  ): CompositionStructure {
    // Determine the flow order of primitives
    const structure: CompositionStructure = {
      layers: [],
      flow: 'linear' // or 'branching', 'conditional'
    };

    // Layer 1: Execution (if needed)
    const executionPrimitives = primitives.filter(p => p.type === 'execution');
    if (executionPrimitives.length > 0) {
      structure.layers.push({
        type: 'execution',
        primitives: executionPrimitives,
        parallel: false
      });
    }

    // Layer 2: Aggregation (if needed)
    const aggregationPrimitives = primitives.filter(p => p.type === 'aggregation');
    if (aggregationPrimitives.length > 0) {
      structure.layers.push({
        type: 'aggregation',
        primitives: aggregationPrimitives,
        parallel: false
      });
    }

    // Layer 3: Confidence handling
    const confidencePrimitives = primitives.filter(p => p.type === 'confidence');
    if (confidencePrimitives.length > 0) {
      structure.layers.push({
        type: 'confidence',
        primitives: confidencePrimitives,
        parallel: false
      });
    }

    // Layer 4: Control/reliability
    const controlPrimitives = primitives.filter(p => p.type === 'control');
    if (controlPrimitives.length > 0) {
      // Retry wraps around everything
      const retry = controlPrimitives.find(p => p.name === 'retry');
      const others = controlPrimitives.filter(p => p.name !== 'retry');
      
      if (others.length > 0) {
        structure.layers.push({
          type: 'control',
          primitives: others,
          parallel: false
        });
      }
      
      // Retry wraps the entire composition
      if (retry) {
        structure.wrappers = [retry];
      }
    }

    return structure;
  }

  private generateConnections(structure: CompositionStructure): Connection[] {
    const connections: Connection[] = [];

    // Connect layers sequentially
    for (let i = 0; i < structure.layers.length - 1; i++) {
      const currentLayer = structure.layers[i];
      const nextLayer = structure.layers[i + 1];

      // Connect all primitives in current layer to all in next
      for (const currentPrimitive of currentLayer.primitives) {
        for (const nextPrimitive of nextLayer.primitives) {
          connections.push({
            from: currentPrimitive.name,
            to: nextPrimitive.name,
            type: 'data-flow'
          });
        }
      }
    }

    return connections;
  }

  private assemblePattern(composition: Composition): ComposedPattern {
    return {
      id: this.generateId(),
      name: this.generateName(composition),
      description: this.generateDescription(composition),
      primitives: composition.primitives.map(p => p.name),
      structure: composition.structure,
      connections: composition.connections,
      metadata: composition.metadata,
      estimatedConfidence: this.estimateConfidence(composition),
      complexity: this.calculateComplexity(composition)
    };
  }

  private generateMetadata(requirements: OrchestrationRequirements): Record<string, any> {
    return {
      goal: requirements.goal,
      strategy: requirements.strategy,
      minConfidence: requirements.minConfidence,
      fallback: requirements.fallback,
      generatedAt: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  private calculateComplexity(analysis: RequirementsAnalysis | Composition): number {
    if ('needsParallelism' in analysis) {
      // From requirements analysis
      let score = 0;
      if (analysis.needsParallelism) score += 2;
      if (analysis.needsConsensus) score += 3;
      if (analysis.needsRetry) score += 1;
      if (analysis.needsFallback) score += 1;
      if (analysis.needsEscalation) score += 2;
      return score;
    } else {
      // From composition
      return analysis.primitives.length * 1.5;
    }
  }

  private estimateConfidence(composition: Composition): number {
    // Estimate based on primitive confidence propagation
    let confidence = 1.0;
    
    for (const primitive of composition.primitives) {
      switch (primitive.confidence) {
        case 'propagates-minimum':
          confidence *= 0.9; // Slight reduction
          break;
        case 'propagates-chain':
          confidence *= 0.95; // Smaller reduction
          break;
        case 'calculated-from-agreement':
          confidence *= 1.1; // Potential increase
          break;
        case 'from-vote-weight':
          confidence *= 1.05; // Small increase
          break;
      }
    }

    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  private generateId(): string {
    return `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateName(composition: Composition): string {
    const primitiveNames = composition.primitives.map(p => p.name);
    return primitiveNames.join('-');
  }

  private generateDescription(composition: Composition): string {
    const flow = composition.primitives.map(p => p.description).join(' → ');
    return `Composed pattern: ${flow}`;
  }
}

// Type definitions
interface CompositionStructure {
  layers: Layer[];
  flow: 'linear' | 'branching' | 'conditional';
  wrappers?: Primitive[];
}

interface Layer {
  type: string;
  primitives: Primitive[];
  parallel: boolean;
}