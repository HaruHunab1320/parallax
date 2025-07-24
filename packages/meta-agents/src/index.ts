/**
 * @parallax/meta-agents
 * 
 * Pattern-aware agents and utilities for Parallax
 */

// Wrappers
export { 
  PatternAwareWrapper, 
  patternAware, 
  makePatternAware,
  type PatternAwareOptions 
} from './wrappers/pattern-aware';

export { 
  withConfidence, 
  ConfidenceAggregator,
  type ConfidenceExtractorOptions 
} from './wrappers/confidence-extractor';

// Agents
export { 
  PatternComposerAgent, 
  createPatternComposerAgent,
  type PatternComposerConfig 
} from './agents/pattern-composer-agent';

// Knowledge
export { 
  PRIMITIVE_DESCRIPTORS,
  getPrimitiveDescriptor,
  getPrimitivesByCategory,
  findCompatiblePrimitives,
  arePrimitivesCompatible,
  type PrimitiveDescriptor 
} from './knowledge/primitive-descriptors';

// Re-export composition utilities from primitives package
export {
  PatternComposer,
  PatternAssembler,
  PatternValidator,
  type OrchestrationRequirements,
  type ComposedPattern,
  type ExecutablePattern
} from '@parallax/primitives';