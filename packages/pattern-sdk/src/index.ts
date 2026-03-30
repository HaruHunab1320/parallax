/**
 * Parallax Pattern SDK
 *
 * Generate orchestration patterns at development time
 */

export { loadConfig, type PatternConfig } from './config/config-loader';
export { PatternGenerator } from './generator/pattern-generator';
// LLM providers
export { createGeminiProvider, GeminiProvider } from './llm/providers/gemini';
export type {
  LoadedPrimitive,
  PrimitiveLoaderOptions,
  PrimitiveMetadata,
} from './primitives/primitive-loader';

// Primitives
export { loadPrimitives, PrimitiveLoader } from './primitives/primitive-loader';
// Templates
export { templates } from './templates';
export { PatternTester } from './testing/pattern-tester';
// Types
export type {
  GeneratorOptions,
  OrchestrationRequirements,
  Pattern,
  PatternMetadata,
  PrimitiveDefinition,
  StageDefinition,
  ValidationResult,
} from './types';

// Utilities
export { formatPatternName } from './utils/naming';
export { loadRequirements } from './utils/requirements-loader';
export { PatternValidator } from './validator/pattern-validator';
export type {
  AgentSelection,
  Aggregation,
  ResultGroup,
  Step,
  YamlPattern,
} from './yaml';
// YAML to Prism compiler
export {
  type CompileOptions,
  type CompileResult,
  compileYamlFile,
  compileYamlToPrism,
} from './yaml';
