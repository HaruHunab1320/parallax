"use strict";
/**
 * Pattern Composer Agent
 *
 * Uses LLM with structured outputs to compose patterns from natural language
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternComposerAgent = void 0;
exports.createPatternComposerAgent = createPatternComposerAgent;
const sdk_typescript_1 = require("@parallax/sdk-typescript");
const ai_1 = require("ai");
const zod_1 = require("zod");
const primitives_1 = require("@parallax/primitives");
// Zod schemas for structured outputs
const RequirementsAnalysisSchema = zod_1.z.object({
    goal: zod_1.z.string().describe('The main objective to achieve'),
    strategy: zod_1.z.enum(['parallel', 'sequential', 'consensus', 'resilient', 'adaptive']),
    actors: zod_1.z.array(zod_1.z.string()).optional().describe('Types of agents needed'),
    constraints: zod_1.z.object({
        minConfidence: zod_1.z.number().min(0).max(1).default(0.5),
        maxTime: zod_1.z.number().optional().describe('Maximum execution time in ms'),
        fallback: zod_1.z.string().optional().describe('Fallback strategy if primary fails')
    }),
    reasoning: zod_1.z.string().describe('Explanation of analysis')
});
const PrimitiveSelectionSchema = zod_1.z.object({
    selected: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().describe('Primitive name'),
        config: zod_1.z.record(zod_1.z.any()).optional().describe('Configuration for this primitive'),
        reason: zod_1.z.string().describe('Why this primitive was selected')
    })),
    order: zod_1.z.array(zod_1.z.string()).describe('Execution order of primitives'),
    confidence: zod_1.z.number().min(0).max(1).describe('Confidence in selection')
});
const CompositionOptimizationSchema = zod_1.z.object({
    optimizations: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.enum(['performance', 'reliability', 'cost', 'simplicity']),
        suggestion: zod_1.z.string(),
        impact: zod_1.z.enum(['high', 'medium', 'low'])
    })),
    alternativeComposition: zod_1.z.array(zod_1.z.string()).optional()
});
class PatternComposerAgent extends sdk_typescript_1.ParallaxAgent {
    constructor(config) {
        super(config.id, config.name || 'Pattern Composer', ['pattern-composition', 'requirement-analysis', 'pattern-optimization']);
        this.llmProvider = config.llmProvider;
        this.composer = new primitives_1.PatternComposer();
        this.assembler = new primitives_1.PatternAssembler();
        this.primitiveDB = new Map();
        // Load primitive descriptors
        if (config.primitiveDescriptors) {
            config.primitiveDescriptors.forEach(desc => {
                this.primitiveDB.set(desc.name, desc);
            });
        }
    }
    async analyze(task, data) {
        try {
            // Step 1: Analyze requirements
            const requirements = await this.analyzeRequirements(task, data);
            // Step 2: Select primitives
            const primitiveSelection = await this.selectPrimitives(requirements, task);
            // Step 3: Convert to OrchestrationRequirements and compose pattern
            const orchRequirements = {
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
            const optimizations = await this.suggestOptimizations(pattern, primitiveSelection, requirements);
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
        }
        catch (error) {
            console.error('Pattern composition failed:', error);
            return this.createResult({
                error: error instanceof Error ? error.message : 'Unknown error',
                suggestion: 'Try providing more specific requirements or constraints'
            }, 0.0);
        }
    }
    async analyzeRequirements(task, context) {
        const { object } = await (0, ai_1.generateObject)({
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
    async selectPrimitives(requirements, originalTask) {
        const primitiveDescriptions = this.formatPrimitiveDescriptions();
        const { object } = await (0, ai_1.generateObject)({
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
    async suggestOptimizations(pattern, selection, requirements) {
        const { object } = await (0, ai_1.generateObject)({
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
    formatPrimitiveDescriptions() {
        const descriptions = [];
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
exports.PatternComposerAgent = PatternComposerAgent;
/**
 * Factory function to create a Pattern Composer Agent
 */
function createPatternComposerAgent(llmProvider, options) {
    return new PatternComposerAgent({
        id: options?.id || `pattern-composer-${Date.now()}`,
        name: options?.name,
        llmProvider,
        primitiveDescriptors: options?.primitiveDescriptors
    });
}
