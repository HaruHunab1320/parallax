/**
 * Pattern Validator
 * 
 * Validates composed patterns using the Prism validator
 */

import { UnifiedValidator } from '@prism-lang/validator';
import { ExecutablePattern, PatternValidation } from '../types';
// import { Logger } from 'pino';
import * as fs from 'fs/promises';
import * as path from 'path';

export class PatternValidator {
  private logger?: any;
  private prismValidator: UnifiedValidator;

  constructor(logger?: any) {
    this.logger = logger;
    this.prismValidator = new UnifiedValidator();
  }

  /**
   * Validates a composed pattern
   */
  async validatePattern(pattern: ExecutablePattern): Promise<PatternValidation> {
    const validation: PatternValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };

    try {
      // Validate the Prism syntax
      const syntaxValidation = await this.validateSyntax(pattern.code);
      
      if (!syntaxValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(...syntaxValidation.errors);
      }
      
      validation.warnings.push(...syntaxValidation.warnings);

      // Validate pattern structure
      const structureValidation = this.validateStructure(pattern);
      if (!structureValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(...structureValidation.errors);
      }
      validation.warnings.push(...structureValidation.warnings);

      // Validate confidence propagation
      const confidenceValidation = this.validateConfidencePropagation(pattern);
      validation.warnings.push(...confidenceValidation.warnings);
      validation.suggestions.push(...confidenceValidation.suggestions);

      // Add optimization suggestions
      const optimizations = this.suggestOptimizations(pattern);
      validation.suggestions.push(...optimizations);

      this.logger?.info({
        patternId: pattern.metadata?.id,
        isValid: validation.isValid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length
      }, 'Pattern validation complete');

    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      this.logger?.error({ error }, 'Pattern validation failed');
    }

    return validation;
  }

  /**
   * Validates Prism syntax using the validator library
   */
  private async validateSyntax(code: string): Promise<PatternValidation> {
    const validation: PatternValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };

    try {
      const result = this.prismValidator.validate(code);
      
      if (!result.valid) {
        validation.isValid = false;
        
        // Extract errors from validator result
        if (result.errors && Array.isArray(result.errors)) {
          validation.errors = result.errors.map((err: any) => 
            typeof err === 'string' ? err : err.message || 'Syntax error'
          );
        } else {
          validation.errors.push('Invalid Prism syntax');
        }
      }

      // Check for common issues
      if (code.includes('undefined')) {
        validation.warnings.push('Pattern contains "undefined" - ensure all variables are properly initialized');
      }

      if (!code.includes('~>')) {
        validation.warnings.push('Pattern does not use confidence operators (~>) - consider adding confidence values');
      }

    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Syntax validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return validation;
  }

  /**
   * Validates the pattern structure
   */
  private validateStructure(pattern: ExecutablePattern): PatternValidation {
    const validation: PatternValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };

    // Check that pattern has required metadata
    if (!pattern.metadata) {
      validation.warnings.push('Pattern missing metadata');
    }

    // Check that primitives are declared
    if (!pattern.primitives || pattern.primitives.length === 0) {
      validation.errors.push('Pattern must use at least one primitive');
      validation.isValid = false;
    }

    // Check confidence value
    if (pattern.confidence < 0 || pattern.confidence > 1) {
      validation.errors.push('Pattern confidence must be between 0 and 1');
      validation.isValid = false;
    }

    // Check for required imports
    const hasImports = pattern.code.includes('import {');
    if (!hasImports && pattern.primitives.length > 0) {
      validation.warnings.push('Pattern uses primitives but has no import statements');
    }

    // Check for export statement
    if (!pattern.code.includes('export')) {
      validation.warnings.push('Pattern should export its main function');
    }

    return validation;
  }

  /**
   * Validates confidence propagation through the pattern
   */
  private validateConfidencePropagation(pattern: ExecutablePattern): {
    warnings: string[];
    suggestions: string[];
  } {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Analyze confidence flow
    const hasThreshold = pattern.primitives.includes('threshold');
    const hasTransform = pattern.primitives.includes('transform');
    const hasConsensus = pattern.primitives.includes('consensus');

    if (!hasThreshold && pattern.metadata?.minConfidence && pattern.metadata.minConfidence > 0.5) {
      suggestions.push('Consider adding a threshold primitive to enforce minimum confidence requirements');
    }

    if (hasConsensus && !hasThreshold) {
      suggestions.push('Consensus pattern typically benefits from threshold filtering');
    }

    // Check for confidence operators in code
    const confidenceOperatorCount = (pattern.code.match(/~>/g) || []).length;
    if (confidenceOperatorCount === 0) {
      warnings.push('Pattern does not use confidence operators (~>) - confidence may not propagate correctly');
    } else if (confidenceOperatorCount < 3 && pattern.primitives.length > 3) {
      suggestions.push('Consider adding more confidence operators to improve confidence tracking');
    }

    return { warnings, suggestions };
  }

  /**
   * Suggests optimizations for the pattern
   */
  private suggestOptimizations(pattern: ExecutablePattern): string[] {
    const suggestions: string[] = [];

    // Check for parallel opportunities
    if (pattern.primitives.includes('sequential') && !pattern.primitives.includes('dependency')) {
      suggestions.push('Consider using parallel execution if tasks are independent');
    }

    // Check for retry without circuit breaker
    if (pattern.primitives.includes('retry') && !pattern.primitives.includes('circuit')) {
      suggestions.push('Consider adding circuit breaker to prevent cascading failures');
    }

    // Check for missing fallback
    if (pattern.metadata?.minConfidence && pattern.metadata.minConfidence > 0.8 && 
        !pattern.primitives.includes('fallback')) {
      suggestions.push('High confidence requirement - consider adding fallback for reliability');
    }

    // Check for redundant primitives
    if (pattern.primitives.includes('parallel') && pattern.primitives.includes('race')) {
      suggestions.push('Pattern uses both parallel and race - consider if both are necessary');
    }

    return suggestions;
  }

  /**
   * Validates a pattern file on disk
   */
  async validatePatternFile(filePath: string): Promise<PatternValidation> {
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      
      // Extract metadata from file
      const pattern: ExecutablePattern = {
        code,
        primitives: this.extractPrimitives(code),
        confidence: this.extractConfidence(code),
        metadata: {
          filePath,
          fileName: path.basename(filePath)
        }
      };

      return this.validatePattern(pattern);
    } catch (error) {
      return {
        isValid: false,
        errors: [`Failed to read pattern file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        suggestions: []
      };
    }
  }

  /**
   * Extracts primitives used from pattern code
   */
  private extractPrimitives(code: string): string[] {
    const primitives: string[] = [];
    const importRegex = /import\s*{\s*([^}]+)\s*}\s*from\s*["']@parallax\/primitives/g;
    let match;

    while ((match = importRegex.exec(code)) !== null) {
      const imports = match[1].split(',').map(s => s.trim());
      primitives.push(...imports);
    }

    return primitives;
  }

  /**
   * Extracts estimated confidence from pattern code
   */
  private extractConfidence(code: string): number {
    // Look for confidence in comments
    const confidenceMatch = code.match(/Estimated Confidence:\s*([\d.]+)/);
    if (confidenceMatch) {
      return parseFloat(confidenceMatch[1]);
    }

    // Count confidence operators as a rough estimate
    const confidenceOperators = (code.match(/~>/g) || []).length;
    return Math.min(1.0, 0.5 + (confidenceOperators * 0.1));
  }
}

/**
 * Helper function to validate a composed pattern
 */
export async function validateComposedPattern(
  pattern: ExecutablePattern,
  logger?: any
): Promise<PatternValidation> {
  const validator = new PatternValidator(logger);
  return validator.validatePattern(pattern);
}