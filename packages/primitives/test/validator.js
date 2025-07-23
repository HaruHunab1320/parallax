const { createValidator } = require('@prism-lang/validator');
const fs = require('fs').promises;
const path = require('path');

// Create a reusable validator instance
const validator = createValidator();

/**
 * Validates a Prism code string
 * @param {string} prismCode - The Prism code to validate
 * @returns {Object} Validation result with { valid, errors, warnings }
 */
function validatePrismCode(prismCode) {
  try {
    const result = validator.validateAll(prismCode);
    
    return {
      valid: result.valid,
      errors: result.formattedErrors || [],
      warnings: result.syntax?.warnings || [],
      raw: result
    };
  } catch (error) {
    return {
      valid: false,
      errors: [{
        message: `Validator crashed: ${error.message}`,
        error: error
      }],
      warnings: [],
      raw: null
    };
  }
}

/**
 * Validates a Prism file
 * @param {string} filePath - Path to the .prism file
 * @returns {Promise<Object>} Validation result with { valid, errors, warnings, filePath }
 */
async function validatePrismFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const result = validatePrismCode(content);
    
    return {
      ...result,
      filePath: filePath,
      fileName: path.basename(filePath)
    };
  } catch (error) {
    return {
      valid: false,
      errors: [{
        message: `Failed to read file: ${error.message}`,
        error: error
      }],
      warnings: [],
      filePath: filePath,
      fileName: path.basename(filePath)
    };
  }
}

/**
 * Extracts specific error details
 * @param {Object} validationResult - Result from validatePrismCode or validatePrismFile
 * @returns {Array} Array of error details with line numbers and messages
 */
function getErrorDetails(validationResult) {
  if (!validationResult.raw) return [];
  
  const errors = [];
  
  // Check syntax errors
  if (validationResult.raw.syntax?.errors) {
    validationResult.raw.syntax.errors.forEach(err => {
      errors.push({
        type: 'syntax',
        line: err.line,
        column: err.column,
        message: err.message
      });
    });
  }
  
  // Check formatted errors
  if (validationResult.raw.formattedErrors) {
    validationResult.raw.formattedErrors.forEach(err => {
      if (!errors.some(e => e.line === err.line && e.message === err.message)) {
        errors.push({
          type: err.error || 'unknown',
          line: err.line,
          column: err.column,
          message: err.message
        });
      }
    });
  }
  
  return errors;
}

// Export functions for use in other scripts
module.exports = {
  validatePrismCode,
  validatePrismFile,
  getErrorDetails
};

// If running directly, validate a file from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node validator.js <path-to-prism-file>');
    console.log('Example: node validator.js ../execution/parallel.prism');
    process.exit(1);
  }
  
  const filePath = path.resolve(args[0]);
  
  validatePrismFile(filePath).then(result => {
    console.log(`Validating: ${result.fileName}`);
    console.log(`Valid: ${result.valid ? '✅' : '❌'}`);
    
    if (!result.valid) {
      console.log('\nErrors:');
      const details = getErrorDetails(result);
      details.forEach(err => {
        console.log(`  Line ${err.line}, Column ${err.column}: ${err.message}`);
      });
    }
    
    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(warn => {
        console.log(`  ${warn.message}`);
      });
    }
    
    process.exit(result.valid ? 0 : 1);
  });
}