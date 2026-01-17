/**
 * Type definitions for Pattern SDK
 */

import { z } from 'zod';

// Requirements Schema
export const OrchestrationRequirementsSchema = z.object({
  goal: z.string().describe('The main objective of the orchestration'),
  strategy: z.string().optional().describe('Overall strategy (consensus, pipeline, etc)'),
  minConfidence: z.number().min(0).max(1).optional().default(0.7),
  fallback: z.string().optional().describe('Fallback action if confidence is low'),
  
  agents: z.array(z.object({
    capability: z.string(),
    count: z.number().optional(),
    minConfidence: z.number().optional()
  })).optional(),
  
  stages: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    parallel: z.boolean().optional(),
    condition: z.string().optional(),
    agents: z.array(z.object({
      capability: z.string(),
      count: z.number().optional()
    })).optional()
  })).optional(),
  
  constraints: z.object({
    maxRetries: z.number().optional(),
    timeout: z.number().optional(),
    maxReviewTime: z.number().optional(),
    requiredApprovals: z.number().optional(),
    blockOnCritical: z.boolean().optional()
  }).optional(),
  context: z.object({
    environment: z.string().optional(),
    previousResults: z.array(z.any()).optional(),
    metadata: z.object({
      tags: z.array(z.string()).optional(),
      source: z.string().optional()
    }).optional()
  }).optional()
});

export type OrchestrationRequirements = z.infer<typeof OrchestrationRequirementsSchema>;

// Pattern Types
export interface Pattern {
  name: string;
  version: string;
  description: string;
  code: string;
  metadata: PatternMetadata;
  requirements: OrchestrationRequirements;
}

export interface PatternMetadata {
  generated: string;
  generator: string;
  primitives: string[];
  complexity: number;
  estimatedAgents: number;
}

// Stage Definition
export interface StageDefinition {
  name: string;
  description?: string;
  parallel?: boolean;
  condition?: string;
  agents?: Array<{
    capability: string;
    count?: number;
  }>;
}

// Generator Options
export interface GeneratorOptions {
  llm: LLMProvider;
  outputDir?: string;
  primitivesPath?: string;
  config?: PatternConfig;
}

// LLM Provider Interface
export interface LLMProvider {
  generateObject<T>(options: {
    schema: z.ZodSchema<T>;
    prompt: string;
    system?: string;
  }): Promise<{ object: T }>;
}

// Pattern Config
export interface PatternConfig {
  version: string;
  generation?: {
    provider?: string;
    model?: string;
    temperature?: number;
  };
  patterns?: {
    outputDir?: string;
    naming?: 'kebab-case' | 'camelCase' | 'snake_case';
  };
  templates?: Record<string, TemplateConfig>;
}

export interface TemplateConfig {
  description: string;
  primitives: string[];
  minAgents?: number;
  defaultConfidence?: number;
}

// Validation
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  line?: number;
  message: string;
  type: 'syntax' | 'semantic' | 'reference';
}

export interface ValidationWarning {
  line?: number;
  message: string;
  type: string;
}

// Primitive Definition
export interface PrimitiveDefinition {
  name: string;
  category: 'execution' | 'aggregation' | 'confidence' | 'control';
  description: string;
  parameters: PrimitiveParameter[];
  examples: PrimitiveExample[];
  generateCode?: (config: any) => string;
}

export interface PrimitiveParameter {
  name: string;
  type: string;
  required: boolean;
  default?: any;
  description: string;
}

export interface PrimitiveExample {
  description: string;
  code: string;
}

// Analysis Types (for LLM)
export const RequirementsAnalysisSchema = z.object({
  needsParallelism: z.boolean(),
  needsSequencing: z.boolean(),
  needsConsensus: z.boolean(),
  needsAggregation: z.boolean(),
  hasThreshold: z.boolean(),
  needsBranching: z.boolean(),
  needsRetry: z.boolean(),
  needsFallback: z.boolean(),
  confidenceRequirement: z.number(),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
  reasoning: z.string()
});

export const PrimitiveSelectionSchema = z.object({
  selected: z.array(z.object({
    name: z.string(),
    reason: z.string(),
    config: z.object({
      maxConcurrency: z.number().optional(),
      threshold: z.number().optional(),
      strategy: z.string().optional(),
      timeout: z.number().optional(),
      maxRetries: z.number().optional(),
      fallbackTo: z.string().optional()
    }).optional()
  })),
  order: z.array(z.string()),
  confidence: z.number(),
  reasoning: z.string()
});

export type RequirementsAnalysis = z.infer<typeof RequirementsAnalysisSchema>;
export type PrimitiveSelection = z.infer<typeof PrimitiveSelectionSchema>;