/**
 * Pattern Validator - Validates generated patterns using Prism validator
 */

import { Pattern, ValidationResult, ValidationError, ValidationWarning } from '../types';
import { createValidator } from '@prism-lang/validator';

export class PatternValidator {
  private prismValidator: any;
  
  constructor() {
    this.prismValidator = createValidator();
  }
  
  /**
   * Validate a pattern
   */
  async validate(pattern: Pattern): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];
    
    // 1. Validate pattern metadata
    this.validateMetadata(pattern, errors, warnings);
    
    // 2. Validate pattern code syntax with Prism validator
    const prismValidation = this.validatePrismSyntax(pattern.code);
    if (!prismValidation.valid) {
      errors.push(...prismValidation.errors);
    }
    warnings.push(...prismValidation.warnings);
    
    // 3. Validate primitive usage
    this.validatePrimitives(pattern, errors, warnings);
    
    // 4. Validate semantic correctness
    this.validateSemantics(pattern, errors, warnings, suggestions);
    
    // 5. Generate suggestions
    this.generateSuggestions(pattern, suggestions);
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }
  
  /**
   * Validate pattern metadata
   */
  private validateMetadata(pattern: Pattern, errors: ValidationError[], warnings: ValidationWarning[]) {
    if (!pattern.name) {
      errors.push({
        message: 'Pattern name is required',
        type: 'semantic'
      });
    }
    
    if (!pattern.version) {
      warnings.push({
        message: 'Pattern version is missing',
        type: 'metadata'
      });
    }
    
    if (!pattern.description) {
      warnings.push({
        message: 'Pattern description is recommended',
        type: 'metadata'
      });
    }
  }
  
  /**
   * Validate pattern syntax using Prism validator
   */
  private validatePrismSyntax(code: string): { valid: boolean; errors: ValidationError[]; warnings: ValidationWarning[] } {
    try {
      const result = this.prismValidator.validateAll(code);
      
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];
      
      // Process syntax errors
      if (result.syntax?.errors) {
        result.syntax.errors.forEach((err: any) => {
          errors.push({
            line: err.line,
            message: err.message,
            type: 'syntax'
          });
        });
      }
      
      // Process formatted errors
      if (result.formattedErrors) {
        result.formattedErrors.forEach((err: any) => {
          if (!errors.some(e => e.line === err.line && e.message === err.message)) {
            errors.push({
              line: err.line,
              message: err.message,
              type: err.error || 'syntax'
            });
          }
        });
      }
      
      // Process warnings
      if (result.syntax?.warnings) {
        result.syntax.warnings.forEach((warn: any) => {
          warnings.push({
            line: warn.line,
            message: warn.message,
            type: 'syntax'
          });
        });
      }
      
      return {
        valid: result.valid,
        errors,
        warnings
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          message: `Validator error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'syntax'
        }],
        warnings: []
      };
    }
  }
  
  
  /**
   * Validate primitive usage
   */
  private validatePrimitives(pattern: Pattern, errors: ValidationError[], warnings: ValidationWarning[]) {
    const code = pattern.code;
    
    // Check that all used primitives are imported
    const importRegex = /import\s*{\s*([^}]+)\s*}\s*from\s*["']@parallax\/primitives/g;
    const imports: string[] = [];
    
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const primitiveList = match[1].split(',').map(p => p.trim());
      imports.push(...primitiveList);
    }
    
    // Find primitive usage in code
    const usedPrimitives = new Set<string>();
    const primitiveNames = ['parallel', 'sequential', 'race', 'batch', 'consensus', 'voting', 
                           'merge', 'threshold', 'transform', 'retry', 'fallback',
                           'circuit', 'timeout', 'escalate', 'cache'];
    // Note: 'reduce' is a built-in Prism function, not a primitive
    
    primitiveNames.forEach(name => {
      const regex = new RegExp(`\\b${name}\\s*\\(`, 'g');
      if (regex.test(code)) {
        usedPrimitives.add(name);
      }
    });
    
    // Check for missing imports
    usedPrimitives.forEach(name => {
      if (!imports.includes(name)) {
        errors.push({
          message: `Primitive "${name}" is used but not imported`,
          type: 'reference'
        });
      }
    });
    
    // Check for unused imports
    imports.forEach(name => {
      if (!usedPrimitives.has(name)) {
        warnings.push({
          message: `Primitive "${name}" is imported but never used`,
          type: 'unused'
        });
      }
    });
  }
  
  /**
   * Validate semantic correctness
   */
  private validateSemantics(pattern: Pattern, errors: ValidationError[], warnings: ValidationWarning[], _suggestions: string[]) {
    const code = pattern.code;
    
    // Check for result assignment
    if (!code.includes('result =') && !code.includes('finalResult =')) {
      errors.push({
        message: 'Pattern must assign a final result',
        type: 'semantic'
      });
    }
    
    // Check for confidence assignment
    if (!code.includes('~>')) {
      warnings.push({
        message: 'Pattern does not assign confidence to result',
        type: 'semantic'
      });
    }
    
    // Check agent initialization
    if (code.includes('agents') && !code.includes('agents =') && !code.includes('agentList')) {
      warnings.push({
        message: 'Pattern uses agents but does not initialize them',
        type: 'semantic'
      });
    }
    
    // Check for minimum confidence usage
    if (pattern.requirements.minConfidence && !code.includes(pattern.requirements.minConfidence.toString())) {
      warnings.push({
        message: 'Specified minimum confidence not found in pattern code',
        type: 'semantic'
      });
    }
  }
  
  /**
   * Generate helpful suggestions
   */
  private generateSuggestions(pattern: Pattern, suggestions: string[]) {
    const code = pattern.code;
    
    // Suggest retry for no fallback
    if (!code.includes('retry') && !code.includes('fallback')) {
      suggestions.push('Consider adding retry or fallback for robustness');
    }
    
    // Suggest timeout for long operations
    if (!code.includes('timeout') && pattern.metadata.estimatedAgents > 5) {
      suggestions.push('Consider adding timeout for operations with many agents');
    }
    
    // Suggest caching for repeated operations
    if (code.includes('sequential') && !code.includes('cache')) {
      suggestions.push('Consider caching results for sequential operations');
    }
    
    // Suggest circuit breaker for external calls
    if (code.includes('escalate') && !code.includes('circuit')) {
      suggestions.push('Consider circuit breaker pattern for external escalations');
    }
  }
  
  /**
   * Auto-fix common validation issues
   */
  async autoFix(pattern: Pattern): Promise<Pattern> {
    let fixedCode = pattern.code;
    
    // Fix missing imports
    const usedPrimitives = this.findUsedPrimitives(fixedCode);
    const importedPrimitives = this.findImportedPrimitives(fixedCode);
    
    usedPrimitives.forEach(primitive => {
      if (!importedPrimitives.includes(primitive)) {
        // Add missing import
        const category = this.getPrimitiveCategory(primitive);
        if (category) {
          const importRegex = new RegExp(`import\\s*{([^}]+)}\\s*from\\s*["']@parallax/primitives/${category}["']`);
          const match = fixedCode.match(importRegex);
          
          if (match) {
            // Add to existing import
            fixedCode = fixedCode.replace(
              match[0],
              match[0].replace(match[1], `${match[1]}, ${primitive}`)
            );
          } else {
            // Add new import
            const firstImport = fixedCode.indexOf('import {');
            if (firstImport !== -1) {
              const endOfLine = fixedCode.indexOf('\n', firstImport);
              fixedCode = fixedCode.slice(0, endOfLine + 1) +
                `import { ${primitive} } from "@parallax/primitives/${category}"\n` +
                fixedCode.slice(endOfLine + 1);
            }
          }
        }
      }
    });
    
    // Fix confidence operator format
    fixedCode = fixedCode.replace(/(\w+)\s*~>\s*(?![\d.])/g, '$1 ~> 0.5 // default confidence applied');
    
    // Fix missing export
    if (!fixedCode.includes('export')) {
      // Wrap in export function if not already
      if (!fixedCode.includes('export function')) {
        const firstImportEnd = fixedCode.lastIndexOf('\n\n') + 2;
        const mainCode = fixedCode.slice(firstImportEnd);
        fixedCode = fixedCode.slice(0, firstImportEnd) +
          'export function executePattern(agents, input) {\n' +
          mainCode.split('\n').map(line => '  ' + line).join('\n') +
          '\n}';
      }
    }
    
    return {
      ...pattern,
      code: fixedCode
    };
  }
  
  /**
   * Find used primitives in code
   */
  private findUsedPrimitives(code: string): string[] {
    const primitives = new Set<string>();
    const primitiveNames = ['parallel', 'sequential', 'race', 'batch', 'consensus', 'voting',
                          'merge', 'reduce', 'threshold', 'transform', 'retry', 'fallback',
                          'circuit', 'timeout', 'escalate', 'cache'];
    
    primitiveNames.forEach(name => {
      const regex = new RegExp(`\\b${name}\\s*\\(`, 'g');
      if (regex.test(code)) {
        primitives.add(name);
      }
    });
    
    return Array.from(primitives);
  }
  
  /**
   * Find imported primitives
   */
  private findImportedPrimitives(code: string): string[] {
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
   * Get primitive category
   */
  private getPrimitiveCategory(primitive: string): string | null {
    const categories: Record<string, string[]> = {
      'execution': ['parallel', 'sequential', 'race', 'batch'],
      'aggregation': ['consensus', 'voting', 'merge', 'reduce'],
      'confidence': ['threshold', 'transform'],
      'control': ['retry', 'fallback', 'circuit', 'timeout', 'escalate', 'cache']
    };
    
    for (const [category, primitives] of Object.entries(categories)) {
      if (primitives.includes(primitive)) {
        return category;
      }
    }
    
    return null;
  }
}
