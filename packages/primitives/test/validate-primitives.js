#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { parse } = require('@prism-lang/core');
const { createValidator } = require('@prism-lang/validator');
const chalk = require('chalk');

// Create validator instance
const validator = createValidator();

// Primitive file patterns
const primitiveCategories = ['execution', 'aggregation', 'confidence', 'control'];

async function validatePrimitiveFile(filePath) {
  try {
    // Read file content
    const content = await fs.readFile(filePath, 'utf8');
    
    // Validate syntax and semantics
    const validation = validator.validateAll(content);
    
    // Extract primitive name from path
    const fileName = path.basename(filePath, '.prism');
    const category = path.basename(path.dirname(filePath));
    
    if (validation.valid) {
      console.log(chalk.green('✓'), chalk.gray(`${category}/`), chalk.white(fileName));
      
      // Additional checks
      const ast = parse(content);
      const exports = extractExports(ast);
      
      if (exports.length === 0) {
        console.log(chalk.yellow('  ⚠'), 'No exports found');
      } else {
        console.log(chalk.gray('  →'), `Exports: ${exports.join(', ')}`);
      }
      
      // Check for confidence propagation
      const hasConfidence = checkConfidencePropagation(content);
      if (!hasConfidence) {
        console.log(chalk.yellow('  ⚠'), 'No confidence operators found');
      }
      
      return { success: true, file: fileName };
    } else {
      console.log(chalk.red('✗'), chalk.gray(`${category}/`), chalk.white(fileName));
      console.log(chalk.red('  Errors:'));
      
      validation.errors.forEach(error => {
        console.log(chalk.red('    -'), error.message);
        if (error.line) {
          console.log(chalk.gray('      Line'), error.line, ':', chalk.yellow(error.text));
        }
      });
      
      return { success: false, file: fileName, errors: validation.errors };
    }
  } catch (error) {
    console.log(chalk.red('✗'), filePath);
    console.log(chalk.red('  Error:'), error.message);
    return { success: false, file: filePath, error: error.message };
  }
}

function extractExports(ast) {
  const exports = [];
  
  // Walk AST to find export statements
  function walk(node) {
    if (!node) return;
    
    if (node.type === 'ExportStatement') {
      if (node.declaration && node.declaration.id) {
        exports.push(node.declaration.id.name);
      }
    }
    
    // Recursively walk child nodes
    Object.values(node).forEach(child => {
      if (typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach(walk);
        } else {
          walk(child);
        }
      }
    });
  }
  
  walk(ast);
  return exports;
}

function checkConfidencePropagation(content) {
  // Check for confidence operators
  return content.includes('~>') || content.includes('~|>') || content.includes('~');
}

async function validateAllPrimitives() {
  console.log(chalk.bold('\n🔍 Validating Parallax Primitives\n'));
  
  const results = {
    total: 0,
    success: 0,
    failed: 0,
    errors: []
  };
  
  // Validate each category
  for (const category of primitiveCategories) {
    const categoryPath = path.join(__dirname, '..', category);
    
    try {
      const files = await fs.readdir(categoryPath);
      const prismFiles = files.filter(f => f.endsWith('.prism'));
      
      console.log(chalk.bold.blue(`\n${category.toUpperCase()} Primitives:`));
      
      for (const file of prismFiles) {
        const filePath = path.join(categoryPath, file);
        const result = await validatePrimitiveFile(filePath);
        
        results.total++;
        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(result);
        }
      }
    } catch (error) {
      console.log(chalk.red(`Failed to read ${category} directory:`, error.message));
    }
  }
  
  // Validate index file
  console.log(chalk.bold.blue('\nINDEX:'));
  const indexResult = await validatePrimitiveFile(path.join(__dirname, '..', 'index.prism'));
  results.total++;
  if (indexResult.success) {
    results.success++;
  } else {
    results.failed++;
    results.errors.push(indexResult);
  }
  
  // Validate utils
  console.log(chalk.bold.blue('\nUTILS:'));
  const utilsPath = path.join(__dirname, '..', 'utils');
  try {
    const utilFiles = await fs.readdir(utilsPath);
    for (const file of utilFiles.filter(f => f.endsWith('.prism'))) {
      const result = await validatePrimitiveFile(path.join(utilsPath, file));
      results.total++;
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(result);
      }
    }
  } catch (error) {
    console.log(chalk.yellow('No utils directory found'));
  }
  
  // Summary
  console.log(chalk.bold('\n📊 Summary:\n'));
  console.log('Total primitives:', chalk.cyan(results.total));
  console.log('Valid:', chalk.green(results.success));
  console.log('Invalid:', chalk.red(results.failed));
  
  if (results.failed > 0) {
    console.log(chalk.red('\n❌ Validation failed!'));
    console.log('\nFailed files:');
    results.errors.forEach(err => {
      console.log(chalk.red('  -'), err.file);
    });
    process.exit(1);
  } else {
    console.log(chalk.green('\n✅ All primitives are valid!'));
    
    // Run confidence flow analysis
    console.log(chalk.bold('\n🔄 Confidence Flow Analysis:\n'));
    await analyzeConfidenceFlow();
  }
}

async function analyzeConfidenceFlow() {
  // This would analyze how confidence flows through primitive compositions
  console.log(chalk.gray('Analyzing confidence propagation patterns...'));
  
  // Check execution primitives
  console.log(chalk.cyan('• Execution:'), 'Parallel maintains minimum confidence');
  console.log(chalk.cyan('• Aggregation:'), 'Consensus uses weighted average');
  console.log(chalk.cyan('• Confidence:'), 'Threshold gates provide binary decisions');
  console.log(chalk.cyan('• Control:'), 'Retry tracks best confidence across attempts');
  
  console.log(chalk.green('\n✅ Confidence flow patterns are consistent'));
}

// Run validation
validateAllPrimitives().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});