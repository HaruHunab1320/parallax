#!/usr/bin/env node

import { validate } from '@prism-lang/validator';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Find all .prism files recursively
function findPrismFiles(dir) {
  const files = [];
  
  function walk(currentDir) {
    const items = readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory() && item !== 'node_modules') {
        walk(fullPath);
      } else if (stat.isFile() && extname(item) === '.prism') {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

// Main validation function
async function validatePrimitives() {
  console.log(`${colors.blue}🔍 Parallax Primitive Validation${colors.reset}\n`);
  
  const primitivesDir = __dirname;
  const prismFiles = findPrismFiles(primitivesDir);
  
  console.log(`Found ${prismFiles.length} primitive files to validate\n`);
  
  let totalPassed = 0;
  let totalFailed = 0;
  const errors = [];
  
  for (const file of prismFiles) {
    const relativePath = file.replace(primitivesDir + '/', '');
    process.stdout.write(`Validating ${relativePath}... `);
    
    try {
      const content = readFileSync(file, 'utf8');
      const result = await validate(content);
      
      if (result.valid) {
        console.log(`${colors.green}✓${colors.reset}`);
        totalPassed++;
      } else {
        console.log(`${colors.red}✗${colors.reset}`);
        totalFailed++;
        errors.push({
          file: relativePath,
          errors: result.errors || ['Unknown validation error']
        });
      }
    } catch (error) {
      console.log(`${colors.red}✗${colors.reset}`);
      totalFailed++;
      errors.push({
        file: relativePath,
        errors: [error.message]
      });
    }
  }
  
  // Print summary
  console.log(`\n${colors.blue}Summary:${colors.reset}`);
  console.log(`  ${colors.green}Passed: ${totalPassed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${totalFailed}${colors.reset}`);
  console.log(`  Total: ${prismFiles.length}`);
  
  // Print errors if any
  if (errors.length > 0) {
    console.log(`\n${colors.red}Validation Errors:${colors.reset}`);
    for (const error of errors) {
      console.log(`\n  ${error.file}:`);
      for (const msg of error.errors) {
        console.log(`    - ${msg}`);
      }
    }
  }
  
  // Exit with appropriate code
  process.exit(totalFailed > 0 ? 1 : 0);
}

// Run validation
validatePrimitives().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});