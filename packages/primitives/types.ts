/**
 * Type definitions for the Pattern Generation system
 */

export interface OrchestrationRequirements {
  goal: string;
  strategy?: string;
  minConfidence?: number;
  fallback?: string;
  context?: Record<string, any>;
}

export interface RequirementsAnalysis {
  needsParallelism: boolean;
  needsSequencing: boolean;
  needsConsensus: boolean;
  needsAggregation: boolean;
  hasThreshold: boolean;
  needsBranching: boolean;
  needsRetry: boolean;
  needsFallback: boolean;
  needsEscalation: boolean;
  confidenceRequirement: number;
  taskCount: number;
  complexityScore: number;
}

export interface Primitive {
  name: string;
  type: 'execution' | 'aggregation' | 'confidence' | 'control' | 'coordination' | 'transformation';
  description: string;
  inputs: string[];
  outputs: string[];
  confidence: string;
  config?: Record<string, any>;
}

export interface Connection {
  from: string;
  to: string;
  type: 'data-flow' | 'control-flow' | 'confidence-flow';
  transformer?: (data: any) => any;
}

export interface Composition {
  primitives: Primitive[];
  structure: any;
  connections: Connection[];
  metadata: Record<string, any>;
}

export interface ComposedPattern {
  id: string;
  name: string;
  description: string;
  primitives: string[];
  structure: any;
  connections: Connection[];
  metadata: Record<string, any>;
  estimatedConfidence: number;
  complexity: number;
}

export interface ExecutablePattern {
  code: string;
  primitives: string[];
  confidence: number;
  metadata?: Record<string, any>;
}

export interface PatternValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface DecomposedPattern {
  primitives: Primitive[];
  composition: Composition;
  improvements: string[];
  reusableParts: ReusableComponent[];
}

export interface ReusableComponent {
  name: string;
  type: string;
  pattern: string;
  description: string;
}