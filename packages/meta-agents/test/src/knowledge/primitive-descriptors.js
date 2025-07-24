"use strict";
/**
 * Primitive Descriptors
 *
 * Rich metadata for each primitive to guide intelligent composition
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIMITIVE_DESCRIPTORS = void 0;
exports.getPrimitiveDescriptor = getPrimitiveDescriptor;
exports.getPrimitivesByCategory = getPrimitivesByCategory;
exports.findCompatiblePrimitives = findCompatiblePrimitives;
exports.arePrimitivesCompatible = arePrimitivesCompatible;
exports.PRIMITIVE_DESCRIPTORS = [
    // Execution Primitives
    {
        name: "parallel",
        category: "execution",
        description: "Executes multiple tasks concurrently with optional concurrency limit",
        whenToUse: [
            "Tasks are independent and can run simultaneously",
            "You want to reduce total execution time",
            "Multiple agents need to work on different parts of a problem",
            "Gathering multiple perspectives or options",
            "No dependencies between tasks"
        ],
        whenNotToUse: [
            "Tasks depend on each other's outputs",
            "Order of execution matters",
            "Resource constraints prevent concurrent execution",
            "You need results from one task before starting another",
            "Sequential processing is required by business logic"
        ],
        parameters: [
            {
                name: "maxConcurrency",
                type: "number",
                description: "Maximum number of tasks to run simultaneously",
                required: false,
                default: "Infinity",
                examples: [3, 5, 10, null]
            }
        ],
        commonlyUsedWith: ["voting", "consensus", "merge", "race", "reduce"],
        incompatibleWith: ["sequential"],
        followedBy: ["voting", "consensus", "merge", "reduce", "threshold"],
        precededBy: ["batch", "partition", "cache"],
        examples: [
            {
                scenario: "Get code reviews from multiple reviewers",
                code: "parallel(3)(reviewerTasks)",
                explanation: "Limits to 3 concurrent reviews to avoid overwhelming the system"
            },
            {
                scenario: "Analyze data from multiple sources",
                code: "parallel()(dataSources.map(source => analyzeTask(source)))",
                explanation: "Process all data sources simultaneously for faster results"
            }
        ],
        performance: {
            latency: "low",
            throughput: "high",
            resourceUsage: "high"
        }
    },
    {
        name: "sequential",
        category: "execution",
        description: "Executes tasks one after another in order",
        whenToUse: [
            "Tasks must be executed in a specific order",
            "Each task depends on the previous task's output",
            "Resource constraints prevent parallel execution",
            "You need to maintain state between tasks",
            "Order of operations is critical"
        ],
        whenNotToUse: [
            "Tasks are independent",
            "You need fast execution and tasks can run in parallel",
            "No dependencies between tasks",
            "You want to maximize throughput"
        ],
        parameters: [],
        commonlyUsedWith: ["transform", "cache", "retry"],
        incompatibleWith: ["parallel", "race"],
        followedBy: ["cache", "threshold", "transform"],
        precededBy: ["validate", "cache"],
        examples: [
            {
                scenario: "Multi-step data transformation pipeline",
                code: "sequential()([validate, transform, enrich, store])",
                explanation: "Each step needs the output from the previous step"
            }
        ],
        performance: {
            latency: "high",
            throughput: "low",
            resourceUsage: "low"
        }
    },
    {
        name: "race",
        category: "execution",
        description: "Returns the first task to complete successfully",
        whenToUse: [
            "You need the fastest response from multiple options",
            "Multiple sources can provide the same information",
            "Fallback options with preference for speed",
            "Time-critical operations"
        ],
        whenNotToUse: [
            "You need all results",
            "Quality is more important than speed",
            "Tasks have different outputs",
            "You need consensus or aggregation"
        ],
        parameters: [],
        commonlyUsedWith: ["cache", "timeout", "fallback"],
        incompatibleWith: ["consensus", "voting"],
        followedBy: ["cache", "transform"],
        precededBy: ["validate"],
        examples: [
            {
                scenario: "Get data from fastest API",
                code: "race()([api1, api2, api3])",
                explanation: "Returns data from whichever API responds first"
            }
        ],
        performance: {
            latency: "low",
            throughput: "medium",
            resourceUsage: "medium"
        }
    },
    // Aggregation Primitives
    {
        name: "consensus",
        category: "aggregation",
        description: "Builds agreement from multiple results based on similarity threshold",
        whenToUse: [
            "You need agreement between multiple agents or results",
            "Quality is more important than speed",
            "You want to filter out outlier opinions",
            "Validation requires multiple confirmations",
            "High confidence in results is critical"
        ],
        whenNotToUse: [
            "Results are numeric and need averaging",
            "You want all opinions regardless of agreement",
            "Speed is critical and you can't wait for consensus",
            "Results are binary (use voting instead)",
            "Single source of truth is sufficient"
        ],
        parameters: [
            {
                name: "threshold",
                type: "number",
                description: "Minimum agreement level required (0.0-1.0)",
                required: true,
                default: 0.7,
                examples: [0.6, 0.7, 0.8, 0.9]
            }
        ],
        commonlyUsedWith: ["parallel", "threshold", "escalate"],
        incompatibleWith: ["race"],
        followedBy: ["threshold", "transform", "cache"],
        precededBy: ["parallel", "batch"],
        examples: [
            {
                scenario: "Ensure 80% of code reviewers agree on assessment",
                code: "consensus(0.8)(reviewResults)",
                explanation: "Requires 80% agreement to build consensus"
            },
            {
                scenario: "Validate data quality across multiple validators",
                code: "consensus(0.9)(validationResults)",
                explanation: "High threshold ensures strong agreement on data quality"
            }
        ],
        performance: {
            latency: "medium",
            throughput: "medium",
            resourceUsage: "medium"
        }
    },
    {
        name: "voting",
        category: "aggregation",
        description: "Aggregates results through various voting strategies",
        whenToUse: [
            "You need to select from discrete options",
            "Binary or categorical decisions",
            "Democratic decision making",
            "You want the most popular choice",
            "Results are easily comparable"
        ],
        whenNotToUse: [
            "Results need nuanced aggregation",
            "Continuous values need averaging",
            "You need unanimous agreement",
            "Minority opinions are important"
        ],
        parameters: [
            {
                name: "strategy",
                type: "string",
                description: "Voting strategy to use",
                required: true,
                default: "majority",
                examples: ["majority", "plurality", "weighted", "ranked"]
            }
        ],
        commonlyUsedWith: ["parallel", "threshold", "quorum"],
        incompatibleWith: ["race"],
        followedBy: ["threshold", "transform", "escalate"],
        precededBy: ["parallel", "filter"],
        examples: [
            {
                scenario: "Choose best solution from multiple proposals",
                code: "voting('ranked')(proposals)",
                explanation: "Uses ranked voting to find most preferred solution"
            }
        ],
        performance: {
            latency: "low",
            throughput: "high",
            resourceUsage: "low"
        }
    },
    // Control Primitives
    {
        name: "retry",
        category: "control",
        description: "Retries failed operations with configurable strategy",
        whenToUse: [
            "Operations may fail transiently",
            "Network requests that might timeout",
            "External services that may be temporarily unavailable",
            "You want to increase reliability",
            "Failures are often temporary"
        ],
        whenNotToUse: [
            "Failures are permanent (e.g., invalid input)",
            "Operation is not idempotent",
            "Cost of retry is high",
            "Real-time constraints don't allow retries"
        ],
        parameters: [
            {
                name: "maxRetries",
                type: "number",
                description: "Maximum number of retry attempts",
                required: true,
                default: 3,
                examples: [3, 5, 10]
            },
            {
                name: "strategy",
                type: "string",
                description: "Backoff strategy for retries",
                required: false,
                default: "exponential",
                examples: ["fixed", "linear", "exponential"]
            }
        ],
        commonlyUsedWith: ["fallback", "circuit", "timeout"],
        incompatibleWith: [],
        followedBy: ["fallback", "cache", "transform"],
        precededBy: ["validate", "timeout"],
        examples: [
            {
                scenario: "Retry API calls with exponential backoff",
                code: "retry(3, 'exponential')(apiCall)",
                explanation: "Retries up to 3 times with increasing delays"
            }
        ],
        performance: {
            latency: "high",
            throughput: "low",
            resourceUsage: "medium"
        }
    },
    {
        name: "fallback",
        category: "control",
        description: "Provides alternative path when primary option fails",
        whenToUse: [
            "You have a preferred approach but need backup options",
            "Reliability is critical",
            "Primary resource might be unavailable",
            "You want graceful degradation",
            "Different quality/cost trade-offs are acceptable"
        ],
        whenNotToUse: [
            "All options should be tried (use retry instead)",
            "You want the best result from multiple options (use race)",
            "Failure should be explicit",
            "No reasonable alternatives exist"
        ],
        parameters: [
            {
                name: "fallbackTo",
                type: "string",
                description: "Identifier for fallback resource or strategy",
                required: true,
                default: null,
                examples: ["cache", "backup-api", "default-response", "simplified-algorithm"]
            }
        ],
        commonlyUsedWith: ["retry", "cache", "timeout", "circuit"],
        incompatibleWith: [],
        followedBy: ["transform", "threshold", "cache"],
        precededBy: ["retry", "timeout", "validate"],
        examples: [
            {
                scenario: "Use cached results if API fails",
                code: "fallback('cache')(apiCall)",
                explanation: "Falls back to cache if API call fails"
            },
            {
                scenario: "Use simple algorithm if ML model fails",
                code: "fallback('rule-based')(mlPrediction)",
                explanation: "Falls back to rule-based approach if ML fails"
            }
        ],
        performance: {
            latency: "low",
            throughput: "high",
            resourceUsage: "low"
        }
    },
    {
        name: "escalate",
        category: "control",
        description: "Escalates to higher authority when conditions are met",
        whenToUse: [
            "Human oversight is required for certain decisions",
            "Confidence is below acceptable threshold",
            "High-risk or high-value decisions",
            "Regulatory compliance requires human approval",
            "Anomalies or edge cases detected"
        ],
        whenNotToUse: [
            "Fully automated processing is required",
            "No escalation path exists",
            "Time constraints don't allow for escalation",
            "Decision is low-risk"
        ],
        parameters: [
            {
                name: "escalationPath",
                type: "string",
                description: "Where/whom to escalate to",
                required: true,
                default: null,
                examples: ["supervisor", "human-review-queue", "senior-analyst", "compliance-team"]
            }
        ],
        commonlyUsedWith: ["threshold", "consensus", "timeout"],
        incompatibleWith: [],
        followedBy: ["cache", "notify"],
        precededBy: ["threshold", "consensus", "voting"],
        examples: [
            {
                scenario: "Escalate low-confidence decisions to human",
                code: "escalate('human-review-queue')(lowConfidenceResult)",
                explanation: "Sends uncertain results for human review"
            }
        ],
        performance: {
            latency: "high",
            throughput: "low",
            resourceUsage: "low"
        }
    },
    // Confidence Primitives
    {
        name: "threshold",
        category: "confidence",
        description: "Filters results based on confidence threshold",
        whenToUse: [
            "You need minimum confidence guarantees",
            "Quality is more important than quantity",
            "Filtering out uncertain results",
            "Compliance requires confidence levels",
            "Risk management based on certainty"
        ],
        whenNotToUse: [
            "All results are needed regardless of confidence",
            "You want to see uncertainty",
            "Confidence scores are not available",
            "Binary pass/fail is too strict"
        ],
        parameters: [
            {
                name: "threshold",
                type: "number",
                description: "Minimum confidence required (0.0-1.0)",
                required: true,
                default: 0.7,
                examples: [0.5, 0.7, 0.8, 0.9, 0.95]
            }
        ],
        commonlyUsedWith: ["consensus", "voting", "transform"],
        incompatibleWith: [],
        followedBy: ["fallback", "escalate", "cache"],
        precededBy: ["consensus", "voting", "transform"],
        examples: [
            {
                scenario: "Only accept high-confidence predictions",
                code: "threshold(0.9)(predictions)",
                explanation: "Filters out predictions below 90% confidence"
            }
        ],
        performance: {
            latency: "low",
            throughput: "high",
            resourceUsage: "low"
        }
    },
    // Coordination Primitives
    {
        name: "quorum",
        category: "coordination",
        description: "Ensures minimum participation before proceeding",
        whenToUse: [
            "Minimum participation is required",
            "Democratic decision making",
            "You need representative results",
            "Avoiding biased decisions from too few participants",
            "Regulatory requirements for participation"
        ],
        whenNotToUse: [
            "Speed is more important than participation",
            "Single authoritative source is sufficient",
            "All participants are always available",
            "Partial results are acceptable"
        ],
        parameters: [
            {
                name: "required",
                type: "number",
                description: "Minimum number of participants required",
                required: true,
                default: null,
                examples: [3, 5, "majority", "2/3"]
            }
        ],
        commonlyUsedWith: ["voting", "consensus", "timeout"],
        incompatibleWith: ["race"],
        followedBy: ["voting", "consensus"],
        precededBy: ["parallel", "delegate"],
        examples: [
            {
                scenario: "Require 3 board members for decision",
                code: "quorum(3)(boardVotes)",
                explanation: "Ensures at least 3 board members participate"
            }
        ],
        performance: {
            latency: "medium",
            throughput: "medium",
            resourceUsage: "low"
        }
    }
];
/**
 * Get primitive descriptor by name
 */
function getPrimitiveDescriptor(name) {
    return exports.PRIMITIVE_DESCRIPTORS.find(p => p.name === name);
}
/**
 * Get all primitive names by category
 */
function getPrimitivesByCategory() {
    const categories = {};
    exports.PRIMITIVE_DESCRIPTORS.forEach(primitive => {
        if (!categories[primitive.category]) {
            categories[primitive.category] = [];
        }
        categories[primitive.category].push(primitive.name);
    });
    return categories;
}
/**
 * Find compatible primitives
 */
function findCompatiblePrimitives(primitiveName) {
    const descriptor = getPrimitiveDescriptor(primitiveName);
    if (!descriptor)
        return [];
    return descriptor.commonlyUsedWith;
}
/**
 * Check if two primitives are compatible
 */
function arePrimitivesCompatible(primitive1, primitive2) {
    const desc1 = getPrimitiveDescriptor(primitive1);
    const desc2 = getPrimitiveDescriptor(primitive2);
    if (!desc1 || !desc2)
        return true; // Assume compatible if unknown
    return !desc1.incompatibleWith.includes(primitive2) &&
        !desc2.incompatibleWith.includes(primitive1);
}
