/**
 * Data Validation Agent
 * 
 * Validates data integrity, format, and business rules
 * with confidence scoring based on validation completeness
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';

interface ValidationRequest {
  data: any;
  schema?: any;
  rules?: ValidationRule[];
  dataType?: string;
}

interface ValidationRule {
  field: string;
  type: 'required' | 'format' | 'range' | 'custom' | 'reference';
  params?: any;
  message?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  statistics: {
    total_fields: number;
    validated_fields: number;
    errors_count: number;
    warnings_count: number;
    data_quality_score: number;
  };
  suggestions: string[];
}

interface ValidationError {
  field: string;
  value: any;
  rule: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
}

interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

class DataValidationAgent extends ParallaxAgent {
  private commonPatterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^\+?[\d\s-()]+$/,
    url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    date: /^\d{4}-\d{2}-\d{2}$/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    creditCard: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
    ssn: /^\d{3}-\d{2}-\d{4}$/,
  };
  
  constructor() {
    super(
      'validator-1',
      'Data Validation Agent',
      ['validation', 'data-quality', 'integrity', 'compliance'],
      {
        expertise: 0.92,
        capabilityScores: {
          validation: 0.95,
          'data-quality': 0.90,
          integrity: 0.92,
          compliance: 0.85
        }
      }
    );
  }
  
  async analyze(task: string, data?: any): Promise<[ValidationResult, number]> {
    if (!data || !data.data) {
      return [{
        valid: false,
        errors: [{
          field: 'root',
          value: null,
          rule: 'required',
          message: 'No data provided for validation',
          severity: 'critical'
        }],
        warnings: [],
        statistics: {
          total_fields: 0,
          validated_fields: 0,
          errors_count: 1,
          warnings_count: 0,
          data_quality_score: 0
        },
        suggestions: ['Provide data to validate']
      }, 0.1];
    }
    
    const request = data as ValidationRequest;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let confidence = 0.95;
    
    // Detect data type if not specified
    const dataType = request.dataType || this.detectDataType(request.data);
    
    // Apply appropriate validation strategy
    if (request.schema) {
      this.validateAgainstSchema(request.data, request.schema, errors, warnings);
    }
    
    if (request.rules) {
      this.validateAgainstRules(request.data, request.rules, errors, warnings);
    }
    
    // Auto-validation based on data type
    this.performAutoValidation(request.data, dataType, errors, warnings);
    
    // Check for data quality issues
    const qualityIssues = this.checkDataQuality(request.data);
    warnings.push(...qualityIssues);
    
    // Calculate statistics
    const stats = this.calculateStatistics(request.data, errors, warnings);
    
    // Adjust confidence based on validation coverage
    if (stats.validated_fields === 0) {
      confidence *= 0.5;
    } else {
      confidence *= (stats.validated_fields / stats.total_fields);
    }
    
    // Generate suggestions
    const suggestions = this.generateSuggestions(errors, warnings, request.data);
    
    return [{
      valid: errors.length === 0,
      errors,
      warnings,
      statistics: stats,
      suggestions
    }, confidence];
  }
  
  private detectDataType(data: any): string {
    if (Array.isArray(data)) {
      return 'array';
    } else if (data instanceof Date) {
      return 'date';
    } else if (typeof data === 'object' && data !== null) {
      // Check for specific object types
      if (data.email || data.phone || data.address) {
        return 'contact';
      } else if (data.amount || data.currency || data.transaction_id) {
        return 'financial';
      } else if (data.username || data.password || data.user_id) {
        return 'user';
      }
      return 'object';
    }
    return typeof data;
  }
  
  private validateAgainstSchema(
    data: any,
    schema: any,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Simple schema validation (in production, use a library like Joi or Yup)
    for (const [field, rules] of Object.entries(schema)) {
      const value = this.getNestedValue(data, field);
      
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field,
          value,
          rule: 'required',
          message: `${field} is required`,
          severity: 'high'
        });
      }
      
      if (value !== undefined && value !== null) {
        // Type validation
        if (rules.type && typeof value !== rules.type) {
          errors.push({
            field,
            value,
            rule: 'type',
            message: `${field} must be of type ${rules.type}`,
            severity: 'medium'
          });
        }
        
        // Format validation
        if (rules.format && this.commonPatterns[rules.format]) {
          if (!this.commonPatterns[rules.format].test(String(value))) {
            errors.push({
              field,
              value,
              rule: 'format',
              message: `${field} has invalid ${rules.format} format`,
              severity: 'medium'
            });
          }
        }
        
        // Range validation
        if (rules.min !== undefined && value < rules.min) {
          errors.push({
            field,
            value,
            rule: 'range',
            message: `${field} must be at least ${rules.min}`,
            severity: 'medium'
          });
        }
        
        if (rules.max !== undefined && value > rules.max) {
          errors.push({
            field,
            value,
            rule: 'range',
            message: `${field} must be at most ${rules.max}`,
            severity: 'medium'
          });
        }
      }
    }
  }
  
  private validateAgainstRules(
    data: any,
    rules: ValidationRule[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    for (const rule of rules) {
      const value = this.getNestedValue(data, rule.field);
      
      switch (rule.type) {
        case 'required':
          if (value === undefined || value === null || value === '') {
            errors.push({
              field: rule.field,
              value,
              rule: 'required',
              message: rule.message || `${rule.field} is required`,
              severity: 'high'
            });
          }
          break;
          
        case 'format':
          if (value && rule.params?.pattern) {
            const pattern = new RegExp(rule.params.pattern);
            if (!pattern.test(String(value))) {
              errors.push({
                field: rule.field,
                value,
                rule: 'format',
                message: rule.message || `${rule.field} format is invalid`,
                severity: 'medium'
              });
            }
          }
          break;
          
        case 'range':
          if (value !== undefined && value !== null) {
            if (rule.params?.min !== undefined && value < rule.params.min) {
              errors.push({
                field: rule.field,
                value,
                rule: 'range',
                message: rule.message || `${rule.field} is below minimum`,
                severity: 'medium'
              });
            }
            if (rule.params?.max !== undefined && value > rule.params.max) {
              errors.push({
                field: rule.field,
                value,
                rule: 'range',
                message: rule.message || `${rule.field} exceeds maximum`,
                severity: 'medium'
              });
            }
          }
          break;
      }
    }
  }
  
  private performAutoValidation(
    data: any,
    dataType: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (dataType === 'contact') {
      // Validate contact information
      if (data.email && !this.commonPatterns.email.test(data.email)) {
        errors.push({
          field: 'email',
          value: data.email,
          rule: 'format',
          message: 'Invalid email format',
          severity: 'high'
        });
      }
      
      if (data.phone && !this.commonPatterns.phone.test(data.phone)) {
        warnings.push({
          field: 'phone',
          message: 'Phone number format may be invalid',
          suggestion: 'Use international format: +1-xxx-xxx-xxxx'
        });
      }
    } else if (dataType === 'financial') {
      // Validate financial data
      if (data.amount !== undefined) {
        if (typeof data.amount !== 'number') {
          errors.push({
            field: 'amount',
            value: data.amount,
            rule: 'type',
            message: 'Amount must be a number',
            severity: 'critical'
          });
        } else if (data.amount < 0) {
          warnings.push({
            field: 'amount',
            message: 'Negative amount detected',
            suggestion: 'Verify if negative amounts are intended'
          });
        }
      }
      
      if (data.currency && !data.currency.match(/^[A-Z]{3}$/)) {
        warnings.push({
          field: 'currency',
          message: 'Currency code should be 3-letter ISO code',
          suggestion: 'Use standard codes like USD, EUR, GBP'
        });
      }
    }
  }
  
  private checkDataQuality(data: any): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    if (typeof data === 'object' && data !== null) {
      // Check for empty values
      for (const [key, value] of Object.entries(data)) {
        if (value === '' || (Array.isArray(value) && value.length === 0)) {
          warnings.push({
            field: key,
            message: `${key} is empty`,
            suggestion: 'Consider removing empty fields or providing values'
          });
        }
        
        // Check for potential PII
        if (typeof value === 'string') {
          if (this.commonPatterns.ssn.test(value)) {
            warnings.push({
              field: key,
              message: 'Potential SSN detected',
              suggestion: 'Ensure PII is properly encrypted and handled'
            });
          }
          
          if (this.commonPatterns.creditCard.test(value.replace(/\s/g, ''))) {
            warnings.push({
              field: key,
              message: 'Potential credit card number detected',
              suggestion: 'Use tokenization for credit card data'
            });
          }
        }
        
        // Check for inconsistent date formats
        if (key.toLowerCase().includes('date') && typeof value === 'string') {
          if (!this.commonPatterns.date.test(value)) {
            warnings.push({
              field: key,
              message: 'Non-standard date format',
              suggestion: 'Use ISO 8601 format (YYYY-MM-DD)'
            });
          }
        }
      }
      
      // Check for duplicate data
      const values = Object.values(data).filter(v => typeof v === 'string');
      const duplicates = values.filter((v, i) => values.indexOf(v) !== i);
      if (duplicates.length > 0) {
        warnings.push({
          field: 'root',
          message: 'Duplicate values detected in different fields',
          suggestion: 'Review data for potential redundancy'
        });
      }
    }
    
    return warnings;
  }
  
  private calculateStatistics(
    data: any,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): ValidationResult['statistics'] {
    const totalFields = this.countFields(data);
    const validatedFields = new Set([
      ...errors.map(e => e.field),
      ...warnings.map(w => w.field)
    ]).size;
    
    const errorScore = errors.reduce((score, error) => {
      switch (error.severity) {
        case 'critical': return score - 10;
        case 'high': return score - 5;
        case 'medium': return score - 2;
        default: return score - 1;
      }
    }, 100);
    
    const warningScore = warnings.length * 0.5;
    const dataQualityScore = Math.max(0, Math.min(100, errorScore - warningScore));
    
    return {
      total_fields: totalFields,
      validated_fields: validatedFields,
      errors_count: errors.length,
      warnings_count: warnings.length,
      data_quality_score: dataQualityScore
    };
  }
  
  private generateSuggestions(
    errors: ValidationError[],
    warnings: ValidationWarning[],
    data: any
  ): string[] {
    const suggestions: string[] = [];
    
    // Critical errors
    const criticalErrors = errors.filter(e => e.severity === 'critical');
    if (criticalErrors.length > 0) {
      suggestions.push(`Fix ${criticalErrors.length} critical errors immediately`);
    }
    
    // Format errors
    const formatErrors = errors.filter(e => e.rule === 'format');
    if (formatErrors.length > 3) {
      suggestions.push('Consider implementing input formatting on data entry');
    }
    
    // Data quality
    if (warnings.length > 5) {
      suggestions.push('Review data collection process to improve quality');
    }
    
    // Schema suggestion
    if (!data.schema && errors.length > 0) {
      suggestions.push('Define a validation schema for consistent data validation');
    }
    
    // Field naming
    const fields = this.getAllFieldNames(data);
    const inconsistentNaming = fields.some(f => f.includes('_')) && fields.some(f => f.match(/[A-Z]/));
    if (inconsistentNaming) {
      suggestions.push('Standardize field naming convention (camelCase or snake_case)');
    }
    
    return suggestions;
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private countFields(obj: any): number {
    if (typeof obj !== 'object' || obj === null) return 1;
    
    let count = 0;
    for (const value of Object.values(obj)) {
      count += this.countFields(value);
    }
    return count || 1;
  }
  
  private getAllFieldNames(obj: any, prefix = ''): string[] {
    if (typeof obj !== 'object' || obj === null) return [];
    
    const fields: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      fields.push(fieldName);
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        fields.push(...this.getAllFieldNames(value, fieldName));
      }
    }
    return fields;
  }
}

// Start the agent
async function main() {
  const agent = new DataValidationAgent();
  const port = await serveAgent(agent, parseInt(process.env.PORT || '50055'));
  
  console.log(`
===========================================
Data Validation Agent Started
===========================================
Port: ${port}
Capabilities: Validation, Data Quality, Integrity, Compliance

Example usage:
{
  "data": {
    "email": "user@example.com",
    "phone": "+1-555-123-4567",
    "amount": 99.99
  },
  "schema": {
    "email": { "required": true, "format": "email" },
    "phone": { "format": "phone" },
    "amount": { "type": "number", "min": 0 }
  }
}
===========================================
  `);
}

if (require.main === module) {
  main().catch(console.error);
}

export { DataValidationAgent };