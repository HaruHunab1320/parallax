/**
 * Pattern Composer Agent
 * 
 * Uses LLM with structured outputs to compose patterns from natural language
 */

import { ParallaxAgent, AgentResponse } from '@parallax/sdk-typescript';
import { generateObject } from 'ai';
import { z } from 'zod';
import { PatternComposer, PatternAssembler, OrchestrationRequirements } from '@parallax/primitives';
import { PrimitiveDescriptor } from '../knowledge/primitive-descriptors';

// Zod schemas for structured outputs
const RequirementsAnalysisSchema = z.object({
  goal: z.string().describe('The main objective to achieve'),
  strategy: z.enum(['parallel', 'sequential', 'consensus', 'resilient', 'adaptive']),
  actors: z.array(z.string()).optional().describe('Types of agents needed'),
  constraints: z.object({
    minConfidence: z.number().min(0).max(1).default(0.5),
    maxTime: z.number().optional().describe('Maximum execution time in ms'),
    fallback: z.string().optional().describe('Fallback strategy if primary fails')
  }),
  reasoning: z.string().describe('Explanation of analysis')
});

const PrimitiveSelectionSchema = z.object({
  selected: z.array(z.object({
    name: z.string().describe('Primitive name'),
    config: z.record(z.any()).optional().describe('Configuration for this primitive'),
    reason: z.string().describe('Why this primitive was selected')
  })),
  order: z.array(z.string()).describe('Execution order of primitives'),
  confidence: z.number().min(0).max(1).describe('Confidence in selection')
});

const CompositionOptimizationSchema = z.object({
  optimizations: z.array(z.object({
    type: z.enum(['performance', 'reliability', 'cost', 'simplicity']),
    suggestion: z.string(),
    impact: z.enum(['high', 'medium', 'low'])
  })),
  alternativeComposition: z.array(z.string()).optional()
});

export interface PatternComposerConfig {
  id: string;
  name?: string;
  llmProvider: any; // User provides their LLM instance
  primitiveDescriptors?: PrimitiveDescriptor[];
}

export class PatternComposerAgent extends ParallaxAgent {
  private llmProvider: any;
  private composer: PatternComposer;
  private assembler: PatternAssembler;
  private primitiveDB: Map<string, PrimitiveDescriptor>;

  constructor(config: PatternComposerConfig) {
    super(
      config.id,
      config.name || 'Pattern Composer',
      ['pattern-composition', 'requirement-analysis', 'pattern-optimization']
    );

    this.llmProvider = config.llmProvider;
    this.composer = new PatternComposer();
    this.assembler = new PatternAssembler();
    this.primitiveDB = new Map();
    
    // Load primitive descriptors
    if (config.primitiveDescriptors) {
      config.primitiveDescriptors.forEach(desc => {
        this.primitiveDB.set(desc.name, desc);
      });
    }
  }

  async analyze(task: string, data?: any): Promise<AgentResponse> {
    try {
      // Step 1: Analyze requirements
      const requirements = await this.analyzeRequirements(task, data);
      
      // Step 2: Select primitives
      const primitiveSelection = await this.selectPrimitives(requirements, task);
      
      // Step 3: Convert to OrchestrationRequirements and compose pattern
      const orchRequirements: OrchestrationRequirements = {
        goal: requirements.goal || task,
        strategy: requirements.strategy,
        minConfidence: requirements.constraints?.minConfidence,
        fallback: requirements.constraints?.fallback,
        context: data
      };
      const composedPattern = await this.composer.composePattern(orchRequirements);
      
      // Step 4: Assemble and validate
      const { pattern, validation } = await this.assembler.assembleWithValidation(composedPattern);
      
      // Step 5: Optimize if needed
      const optimizations = await this.suggestOptimizations(
        pattern,
        primitiveSelection,
        requirements
      );

      const result = {
        pattern: pattern.code,
        metadata: {
          requirements,
          selectedPrimitives: primitiveSelection.selected,
          executionOrder: primitiveSelection.order,
          validation,
          optimizations: optimizations.optimizations,
          confidence: primitiveSelection.confidence
        }
      };

      return this.createResult(result, primitiveSelection.confidence);

    } catch (error) {
      console.error('Pattern composition failed:', error);
      return this.createResult({
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestion: 'Try providing more specific requirements or constraints'
      }, 0.0);
    }
  }

  private async analyzeRequirements(task: string, context?: any) {
    const { object } = await generateObject({
      model: this.llmProvider,
      schema: RequirementsAnalysisSchema,
      prompt: `Analyze this orchestration task and extract structured requirements:

Task: ${task}
${context ? `Context: ${JSON.stringify(context, null, 2)}` : ''}

Consider:
- What is the main goal?
- Is parallel or sequential execution more appropriate?
- What actors/agents might be involved?
- What confidence level is needed?
- Are there time constraints?
- Is a fallback strategy needed?

Provide clear reasoning for your analysis.`
    });

    return object;
  }

  private async selectPrimitives(
    requirements: z.infer<typeof RequirementsAnalysisSchema>,
    originalTask: string
  ) {
    const primitiveDescriptions = this.formatPrimitiveDescriptions();

    const { object } = await generateObject({
      model: this.llmProvider,
      schema: PrimitiveSelectionSchema,
      prompt: `Select the appropriate primitives for this orchestration task:

Original Task: ${originalTask}
Analyzed Requirements: ${JSON.stringify(requirements, null, 2)}

Available Primitives:
${primitiveDescriptions}

Instructions:
1. Select primitives that best match the requirements
2. Consider the "whenToUse" and "whenNotToUse" guidance
3. Check compatibility between primitives
4. Specify execution order
5. Provide configuration where needed
6. Explain your reasoning for each selection

Remember:
- Primitives should work together coherently
- Consider confidence propagation through the chain
- Simpler is often better - don't over-engineer`
    });

    return object;
  }

  private async suggestOptimizations(
    pattern: any,
    selection: z.infer<typeof PrimitiveSelectionSchema>,
    requirements: z.infer<typeof RequirementsAnalysisSchema>
  ) {
    const { object } = await generateObject({
      model: this.llmProvider,
      schema: CompositionOptimizationSchema,
      prompt: `Suggest optimizations for this pattern composition:

Requirements: ${JSON.stringify(requirements, null, 2)}
Selected Primitives: ${selection.selected.map(p => p.name).join(' → ')}
Current Pattern Complexity: ${selection.selected.length} primitives

Consider optimizations for:
- Performance: Can execution be faster?
- Reliability: Can failure handling be improved?
- Cost: Can we reduce resource usage?
- Simplicity: Can we achieve the same with fewer primitives?

Provide actionable suggestions with impact assessment.`
    });

    return object;
  }

  private formatPrimitiveDescriptions(): string {
    const descriptions: string[] = [];
    
    this.primitiveDB.forEach((desc, name) => {
      descriptions.push(`
### ${name} (${desc.category})
Description: ${desc.description}
When to use: ${desc.whenToUse.join('; ')}
When NOT to use: ${desc.whenNotToUse.join('; ')}
Commonly used with: ${desc.commonlyUsedWith.join(', ')}
Incompatible with: ${desc.incompatibleWith.join(', ')}
`);
    });

    return descriptions.join('\n');
  }
}

/**
 * Factory function to create a Pattern Composer Agent
 */
export function createPatternComposerAgent(
  llmProvider: any,
  options?: {
    id?: string;
    name?: string;
    primitiveDescriptors?: PrimitiveDescriptor[];
  }
): PatternComposerAgent {
  return new PatternComposerAgent({
    id: options?.id || `pattern-composer-${Date.now()}`,
    name: options?.name,
    llmProvider,
    primitiveDescriptors: options?.primitiveDescriptors
  });
}