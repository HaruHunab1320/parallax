/**
 * YAML Pattern Schema Types
 *
 * These types define the YAML format that compiles to Prism.
 * The YAML is designed to be intuitive for developers while
 * mapping cleanly to Prism's agentic primitives.
 */

import { z } from 'zod';

/**
 * Input property definition
 */
export const InputPropertySchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string().optional(),
  required: z.boolean().optional().default(true),
  default: z.any().optional(),
});

/**
 * Agent selection criteria
 */
export const AgentSelectionSchema = z.object({
  capabilities: z.array(z.string()),
  min: z.number().optional().default(1),
  max: z.number().optional(),
  // Future: specific agent IDs, model preferences, etc.
});

/**
 * Result grouping - filters agent results by criteria
 */
export const ResultGroupSchema = z.object({
  match: z.string(), // Expression like "result.analysisType == 'summary'"
  take: z.enum(['first', 'last', 'all']).optional().default('first'),
});

/**
 * Aggregation strategies
 */
export const AggregationSchema = z.discriminatedUnion('strategy', [
  z.object({
    strategy: z.literal('consensus'),
    threshold: z.number().optional().default(0.7),
    minVotes: z.number().optional(),
  }),
  z.object({
    strategy: z.literal('voting'),
    method: z.enum(['majority', 'unanimous', 'weighted']).optional().default('majority'),
  }),
  z.object({
    strategy: z.literal('merge'),
    fields: z.array(z.string()).optional(),
  }),
  z.object({
    strategy: z.literal('best'),
    by: z.enum(['confidence', 'custom']).optional().default('confidence'),
    expression: z.string().optional(), // Custom sort expression
  }),
]);

/**
 * Confidence calculation
 */
export const ConfidenceSchema = z.union([
  z.enum(['average', 'min', 'max', 'weighted']),
  z.object({
    method: z.enum(['average', 'min', 'max', 'weighted', 'custom']),
    expression: z.string().optional(), // For custom: "results.reduce(...)"
    weights: z.record(z.string(), z.number()).optional(), // For weighted: { "summary": 0.3, "actions": 0.7 }
  }),
]);

/**
 * Step in a multi-phase pattern
 */
export const StepSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  agents: AgentSelectionSchema.optional(),
  input: z.union([
    z.literal('$input'), // Original input
    z.string(), // Reference like "$steps.previous.output"
  ]).optional(),
  groups: z.record(z.string(), ResultGroupSchema).optional(),
  aggregation: AggregationSchema.optional(),
  output: z.record(z.string(), z.any()).optional(),
  condition: z.string().optional(), // "confidence < 0.8" - when to execute
});

/**
 * Main YAML Pattern Schema
 */
export const YamlPatternSchema = z.object({
  // Metadata
  name: z.string(),
  version: z.string().optional().default('1.0.0'),
  description: z.string(),

  // Input schema
  input: z.record(z.string(), z.union([
    z.string(), // Shorthand: "document: string"
    InputPropertySchema,
  ])),

  // Agent selection (for simple single-phase patterns)
  agents: AgentSelectionSchema.optional(),

  // Result grouping (for simple patterns)
  groups: z.record(z.string(), ResultGroupSchema).optional(),

  // Multi-step patterns (for complex orchestration)
  steps: z.array(StepSchema).optional(),

  // Aggregation strategy
  aggregation: AggregationSchema.optional(),

  // Output mapping - uses $references to group results
  output: z.record(z.string(), z.any()),

  // How to calculate final confidence
  confidence: ConfidenceSchema.optional().default('average'),

  // Fallback behavior
  fallback: z.object({
    condition: z.string(), // "confidence < 0.5"
    action: z.enum(['escalate', 'retry', 'default']),
    target: z.string().optional(), // For escalate: agent capability
    value: z.any().optional(), // For default: fallback value
    maxRetries: z.number().optional(), // For retry
  }).optional(),
});

export type YamlPattern = z.infer<typeof YamlPatternSchema>;
export type InputProperty = z.infer<typeof InputPropertySchema>;
export type AgentSelection = z.infer<typeof AgentSelectionSchema>;
export type ResultGroup = z.infer<typeof ResultGroupSchema>;
export type Aggregation = z.infer<typeof AggregationSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Step = z.infer<typeof StepSchema>;
