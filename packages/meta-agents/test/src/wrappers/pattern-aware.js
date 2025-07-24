"use strict";
/**
 * Pattern-Aware Wrapper
 *
 * Enhances agents with automatic pattern composition capabilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternAwareWrapper = void 0;
exports.patternAware = patternAware;
exports.makePatternAware = makePatternAware;
const primitives_1 = require("@parallax/primitives");
class PatternAwareWrapper {
    constructor(agent, options = {}) {
        this.agent = agent;
        this.composer = new primitives_1.PatternComposer();
        this.assembler = new primitives_1.PatternAssembler();
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
    enhance() {
        const wrapper = this;
        const enhancedAgent = Object.create(this.agent);
        // Override the execute method
        enhancedAgent.execute = async function (task) {
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
        enhancedAgent.composePattern = async (requirements) => {
            return wrapper.composePattern(requirements);
        };
        enhancedAgent.getPatternCache = () => wrapper.patternCache;
        return enhancedAgent;
    }
    /**
     * Compose a pattern from requirements
     */
    async composePattern(requirements) {
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
            }
            else {
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
        }
        catch (error) {
            console.error('Pattern composition failed:', error);
            return null;
        }
    }
    /**
     * Generate cache key from requirements
     */
    getCacheKey(requirements) {
        return JSON.stringify({
            goal: requirements.goal,
            strategy: requirements.strategy,
            minConfidence: requirements.minConfidence
        });
    }
}
exports.PatternAwareWrapper = PatternAwareWrapper;
/**
 * Decorator for making agents pattern-aware
 */
function patternAware(options) {
    return function (target) {
        const originalConstructor = target;
        const newConstructor = function (...args) {
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
function makePatternAware(agent, options) {
    const wrapper = new PatternAwareWrapper(agent, options);
    return wrapper.enhance();
}
