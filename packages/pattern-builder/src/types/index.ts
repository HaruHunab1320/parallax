/**
 * Type exports for Pattern Builder
 */

export * from './nodes';
export * from './edges';

// Pattern metadata
export interface PatternMetadata {
  name: string;
  version: string;
  description: string;
}

// Complete pattern state
export interface PatternState {
  metadata: PatternMetadata;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// Validation types
export interface ValidationError {
  nodeId?: string;
  field?: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  nodeId?: string;
  field?: string;
  message: string;
  code: string;
}

// Export result
export interface ExportResult {
  yaml: string;
  prism?: string;
  errors: ValidationError[];
}
