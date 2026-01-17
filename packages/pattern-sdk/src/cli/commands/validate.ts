/**
 * Pattern validation command
 */

import { Command } from 'commander';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import { PatternValidator } from '../../validator/pattern-validator';
import { Pattern } from '../../types';

export const validateCommand = new Command('validate')
  .description('Validate a pattern file')
  .argument('<path>', 'Path to pattern file (.prism)')
  .option('-v, --verbose', 'Show detailed validation output')
  .action(async (filePath, options) => {
    try {
      // Check if file exists
      if (!await fs.pathExists(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
      }
      
      const spinner = ora('Loading pattern...').start();
      
      // Read pattern file
      const content = await fs.readFile(filePath, 'utf8');
      
      // Extract metadata from comments
      const nameMatch = content.match(/\/\/\s*Pattern:\s+(.+)/);
      const versionMatch = content.match(/\/\/\s*Version:\s+(.+)/);
      const descriptionMatch = content.match(/\/\/\s*Description:\s+(.+)/);
      const primitivesMatch = content.match(/\/\/\s*Primitives:\s+(.+)/);
      
      // Create pattern object
      const pattern: Pattern = {
        name: nameMatch ? nameMatch[1] : 'unknown',
        version: versionMatch ? versionMatch[1] : '1.0.0',
        description: descriptionMatch ? descriptionMatch[1] : '',
        code: content.replace(/\/\*\*[\s\S]*?\*\/\n*/, ''), // Remove header comment
        metadata: {
          generated: new Date().toISOString(),
          generator: '@parallax/pattern-sdk',
          primitives: primitivesMatch ? primitivesMatch[1].split(',').map(p => p.trim()) : [],
          complexity: 0,
          estimatedAgents: 0
        },
        requirements: { goal: descriptionMatch ? descriptionMatch[1] : '', minConfidence: 0.7 }
      };
      
      spinner.succeed('Pattern loaded');
      
      // Validate pattern
      const validateSpinner = ora('Validating pattern...').start();
      const validator = new PatternValidator();
      const validation = await validator.validate(pattern);
      
      if (validation.isValid) {
        validateSpinner.succeed(chalk.green('✓ Pattern is valid'));
      } else {
        validateSpinner.fail(chalk.red('✗ Pattern has errors'));
      }
      
      // Display results
      if (validation.errors.length > 0) {
        console.log(chalk.bold.red('\nErrors:'));
        validation.errors.forEach(error => {
          const location = error.line ? ` (line ${error.line})` : '';
          console.log(chalk.red(`  ✗ ${error.message}${location}`));
          if (options.verbose && error.type) {
            console.log(chalk.gray(`    Type: ${error.type}`));
          }
        });
      }
      
      if (validation.warnings.length > 0) {
        console.log(chalk.bold.yellow('\nWarnings:'));
        validation.warnings.forEach(warning => {
          const location = warning.line ? ` (line ${warning.line})` : '';
          console.log(chalk.yellow(`  ⚠ ${warning.message}${location}`));
          if (options.verbose && warning.type) {
            console.log(chalk.gray(`    Type: ${warning.type}`));
          }
        });
      }
      
      if (validation.suggestions.length > 0) {
        console.log(chalk.bold.blue('\nSuggestions:'));
        validation.suggestions.forEach(suggestion => {
          console.log(chalk.blue(`  ℹ ${suggestion}`));
        });
      }
      
      // Summary
      if (options.verbose) {
        console.log(chalk.bold('\nPattern Summary:'));
        console.log(chalk.gray('  Name:'), pattern.name);
        console.log(chalk.gray('  Version:'), pattern.version);
        console.log(chalk.gray('  Primitives:'), pattern.metadata.primitives.join(', '));
      }
      
      // Exit with appropriate code
      process.exit(validation.isValid ? 0 : 1);
      
    } catch (error) {
      console.error(chalk.red('\nError validating pattern:'), error);
      process.exit(1);
    }
  });