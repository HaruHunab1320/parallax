/**
 * Pattern Templates
 */

export interface PatternTemplate {
  description: string;
  minAgents: number;
  defaultConfidence: number;
  defaultPrimitives: string[];
  example?: string;
}

export const templates: Record<string, PatternTemplate> = {
  'consensus': {
    description: 'Multiple agents reach agreement on a decision',
    minAgents: 3,
    defaultConfidence: 0.8,
    defaultPrimitives: ['parallel', 'consensus', 'threshold'],
    example: `import { parallel, consensus, threshold } from "@parallax/primitives"

// Execute agents in parallel
results = parallel(3)(agents)

// Reach consensus
agreement = consensus(results, 0.7)

// Apply confidence threshold
finalResult = threshold(agreement, 0.8)

// Return with confidence
finalResult ~> 0.85`
  },
  
  'pipeline': {
    description: 'Sequential processing through multiple stages',
    minAgents: 2,
    defaultConfidence: 0.7,
    defaultPrimitives: ['sequential', 'transform', 'fallback'],
    example: `import { sequential, transform, fallback } from "@parallax/primitives"

// Process through stages
stage1 = sequential(analysisAgents)
stage2 = transform(stage1, "enhance")
result = sequential(validationAgents, stage2)

// Handle failures
finalResult = fallback(result, "senior-expert")

// Return with confidence
finalResult ~> 0.7`
  },
  
  'voting': {
    description: 'Democratic decision making with voting',
    minAgents: 5,
    defaultConfidence: 0.6,
    defaultPrimitives: ['parallel', 'voting', 'threshold'],
    example: `import { parallel, voting, threshold } from "@parallax/primitives"

// Collect votes in parallel
votes = parallel(5)(agents)

// Tally votes (majority wins)
decision = voting(votes, "majority")

// Ensure minimum participation
finalResult = threshold(decision, 0.6)

// Return with confidence
finalResult ~> confidence`
  },
  
  'hierarchical': {
    description: 'Tiered decision making with escalation',
    minAgents: 4,
    defaultConfidence: 0.75,
    defaultPrimitives: ['parallel', 'threshold', 'escalate', 'retry'],
    example: `import { parallel, threshold, escalate, retry } from "@parallax/primitives"

// First tier assessment
tier1 = parallel(3)(juniorAgents)
result1 = threshold(tier1, 0.7)

// Escalate if confidence is low
if (result1.confidence < 0.7) {
  tier2 = escalate(result1, "senior-expert")
  result = retry(2)(tier2)
} else {
  result = result1
}

// Return with confidence
result ~> result.confidence`
  },
  
  'resilient': {
    description: 'Fault-tolerant pattern with retries and circuit breaker',
    minAgents: 3,
    defaultConfidence: 0.8,
    defaultPrimitives: ['parallel', 'retry', 'circuit', 'fallback', 'cache'],
    example: `import { parallel, retry, circuit, fallback, cache } from "@parallax/primitives"

// Setup circuit breaker
breaker = circuit(5, 60) // 5 failures, 60s timeout

// Cached parallel execution with retry
execution = cache(300)( // 5 min cache
  retry(3)(
    breaker(
      parallel(3)(agents)
    )
  )
)

// Fallback for circuit open
result = fallback(execution, "backup-service")

// Return with confidence
result ~> 0.8`
  },
  
  'map-reduce': {
    description: 'Distributed processing with aggregation',
    minAgents: 10,
    defaultConfidence: 0.7,
    defaultPrimitives: ['batch', 'parallel', 'map', 'reduce'],
    example: `import { batch, parallel, map, reduce } from "@parallax/primitives"

// Batch data for processing
batches = batch(data, 100)

// Map operation across agents
mapped = parallel(10)(
  map(agents, batches)
)

// Reduce results
result = reduce(mapped, "aggregate")

// Return with confidence
result ~> 0.7`
  }
};