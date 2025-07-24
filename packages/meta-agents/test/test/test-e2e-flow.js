"use strict";
/**
 * End-to-End Test: Pattern Generation Flow
 *
 * Demonstrates the complete flow from natural language to executable pattern
 */
Object.defineProperty(exports, "__esModule", { value: true });
const src_1 = require("../src");
const sdk_typescript_1 = require("@parallax/sdk-typescript");
// Mock LLM Provider for testing
class MockLLMProvider {
    async generateObject({ schema, prompt }) {
        console.log('\n🤖 LLM Processing:');
        console.log('Prompt preview:', prompt.substring(0, 200) + '...');
        // Simulate structured responses based on prompt content
        if (prompt.includes('Analyze this orchestration task')) {
            return {
                object: {
                    goal: "Get consensus from multiple code reviewers",
                    strategy: "consensus",
                    actors: ["reviewer1", "reviewer2", "reviewer3"],
                    constraints: {
                        minConfidence: 0.8,
                        maxTime: 30000,
                        fallback: "escalate to senior reviewer"
                    },
                    reasoning: "Multiple reviewers need to agree on code quality, requiring consensus pattern"
                }
            };
        }
        if (prompt.includes('Select the appropriate primitives')) {
            return {
                object: {
                    selected: [
                        {
                            name: "parallel",
                            config: { maxConcurrency: 3 },
                            reason: "Review tasks are independent"
                        },
                        {
                            name: "consensus",
                            config: { threshold: 0.8 },
                            reason: "Need agreement among reviewers"
                        },
                        {
                            name: "threshold",
                            config: { threshold: 0.8 },
                            reason: "Only accept high-confidence consensus"
                        },
                        {
                            name: "fallback",
                            config: { fallbackTo: "senior-reviewer" },
                            reason: "Escalate if consensus not reached"
                        }
                    ],
                    order: ["parallel", "consensus", "threshold", "fallback"],
                    confidence: 0.9
                }
            };
        }
        if (prompt.includes('Suggest optimizations')) {
            return {
                object: {
                    optimizations: [
                        {
                            type: "performance",
                            suggestion: "Consider adding cache primitive for repeated reviews",
                            impact: "medium"
                        },
                        {
                            type: "reliability",
                            suggestion: "Add retry for transient reviewer failures",
                            impact: "high"
                        }
                    ]
                }
            };
        }
        return { object: {} };
    }
}
// Example Agent that will be enhanced
class CodeReviewAgent extends sdk_typescript_1.ParallaxAgent {
    constructor() {
        super('code-reviewer-1', 'Code Review Agent', ['code-review', 'analysis']);
    }
    async analyze(task, data) {
        console.log(`\n🔍 Analyzing: ${task}`);
        // Simulate code review
        return this.createResult({
            review: {
                quality: 'good',
                issues: ['Consider adding error handling', 'Document complex logic'],
                confidence: 0.85
            }
        }, 0.85);
    }
}
async function runE2ETest() {
    console.log('🚀 End-to-End Pattern Generation Test\n');
    console.log('='.repeat(80));
    // Step 1: Create Pattern Composer Agent with mock LLM
    console.log('\n📋 Step 1: Create Pattern Composer Agent');
    const composer = (0, src_1.createPatternComposerAgent)(new MockLLMProvider(), {
        id: 'test-composer',
        primitiveDescriptors: src_1.PRIMITIVE_DESCRIPTORS
    });
    // Step 2: Natural language request
    console.log('\n📋 Step 2: Natural Language Request');
    const request = "I need to get code review consensus from multiple reviewers with high confidence";
    console.log(`Request: "${request}"`);
    // Step 3: Pattern composition
    console.log('\n📋 Step 3: Pattern Composition');
    const compositionResponse = await composer.analyze(request, {
        context: 'code-review-system'
    });
    const compositionResult = compositionResponse.value;
    const confidence = compositionResponse.confidence;
    console.log('\n✅ Composition Result:');
    console.log('- Confidence:', confidence);
    console.log('- Selected Primitives:', compositionResult.metadata.selectedPrimitives.map((p) => p.name));
    console.log('- Execution Order:', compositionResult.metadata.executionOrder);
    console.log('- Optimizations:', compositionResult.metadata.optimizations);
    // Step 4: Show generated pattern
    console.log('\n📋 Step 4: Generated Pattern');
    console.log('```prism');
    console.log(compositionResult.pattern);
    console.log('```');
    // Step 5: Create pattern-aware agent
    console.log('\n📋 Step 5: Create Pattern-Aware Agent');
    const reviewAgent = new CodeReviewAgent();
    const patternAwareAgent = (0, src_1.makePatternAware)(reviewAgent, {
        autoCompose: true,
        cachePatterns: true
    });
    // Step 6: Execute with orchestration needs
    console.log('\n📋 Step 6: Execute with Orchestration Needs');
    const executionResult = await patternAwareAgent.analyze("Review pull request #123", {
        data: {
            prUrl: "https://github.com/example/repo/pull/123",
            files: ["src/index.ts", "src/utils.ts"]
        },
        orchestrationNeeds: {
            goal: "consensus code review",
            strategy: "multi-reviewer consensus",
            minConfidence: 0.8
        }
    });
    console.log('\n✅ Execution Result:');
    console.log('- Review Result:', executionResult.value.review);
    console.log('- Pattern Used:', executionResult.value.pattern ? 'Yes' : 'No');
    console.log('- Confidence:', executionResult.confidence);
    // Step 7: Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n✨ E2E Test Complete!');
    console.log('\nDemonstrated Flow:');
    console.log('1. Natural language request → Pattern Composer Agent');
    console.log('2. Structured analysis of requirements');
    console.log('3. Intelligent primitive selection');
    console.log('4. Pattern composition and validation');
    console.log('5. Pattern-aware agent enhancement');
    console.log('6. Automatic pattern application during execution');
    console.log('\n🎯 Key Achievement:');
    console.log('Natural language → Working orchestration pattern → Enhanced execution');
}
// Run the test
runE2ETest().catch(console.error);
