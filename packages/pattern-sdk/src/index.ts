/**
 * Parallax Pattern SDK
 * 
 * Generate orchestration patterns at development time
 */

export { PatternGenerator } from './generator/pattern-generator';
export { PatternTester } from './testing/pattern-tester';
export { PatternValidator } from './validator/pattern-validator';
export { loadConfig, type PatternConfig } from './config/config-loader';

// Primitives
export { PrimitiveLoader, loadPrimitives } from './primitives/primitive-loader';
export type { LoadedPrimitive, PrimitiveMetadata, PrimitiveLoaderOptions } from './primitives/primitive-loader';

// Types
export type {
  OrchestrationRequirements,
  Pattern,
  PatternMetadata,
  GeneratorOptions,
  ValidationResult,
  PrimitiveDefinition,
  StageDefinition
} from './types';

// Templates
export { templates } from './templates';

// Utilities
export { formatPatternName } from './utils/naming';
export { loadRequirements } from './utils/requirements-loader';

// LLM providers
export { GeminiProvider, createGeminiProvider } from './llm/providers/gemini';

// YAML to Prism compiler
export { compileYamlToPrism, compileYamlFile, type CompileOptions, type CompileResult } from './yaml';
export type { YamlPattern, AgentSelection, ResultGroup, Aggregation, Step } from './yaml';
