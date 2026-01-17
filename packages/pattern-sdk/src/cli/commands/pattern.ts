/**
 * Pattern generation command
 */

import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { PatternGenerator } from '../../generator/pattern-generator';
import { setupLLM } from '../utils/llm-setup';
import { interactivePatternPrompt } from '../utils/prompts';
import { loadRequirements } from '../../utils/requirements-loader';
import { OrchestrationRequirements } from '../../types';

export const patternCommand = new Command('pattern')
  .description('Generate a new orchestration pattern')
  .argument('[description]', 'Pattern description or goal')
  .option('-f, --file <path>', 'Load requirements from file')
  .option('-o, --output <path>', 'Output path for pattern')
  .option('-i, --interactive', 'Interactive mode')
  .option('--provider <provider>', 'LLM provider (openai, anthropic, custom)')
  .option('--api-key <key>', 'API key for LLM provider')
  .option('--model <model>', 'Model to use (e.g., gpt-4, claude-3)')
  .option('--dry-run', 'Generate pattern without saving')
  .action(async (description, options) => {
    try {
      let requirements: OrchestrationRequirements;
      
      // 1. Get requirements
      if (options.interactive) {
        requirements = await interactivePatternPrompt();
      } else if (options.file) {
        const spinner = ora('Loading requirements...').start();
        requirements = await loadRequirements(options.file);
        spinner.succeed('Requirements loaded');
      } else if (description) {
        requirements = { goal: description, minConfidence: 0.7 };
      } else {
        console.error(chalk.red('Error: Please provide a description, use --interactive, or specify --file'));
        process.exit(1);
      }
      
      // 2. Setup LLM
      const spinner = ora('Setting up LLM provider...').start();
      const llm = await setupLLM({
        provider: options.provider,
        apiKey: options.apiKey,
        model: options.model
      });
      spinner.succeed('LLM provider configured');
      
      // 3. Initialize generator
      const outputDir = options.output ? path.dirname(options.output) : './patterns';
      const generator = new PatternGenerator({
        llm,
        outputDir
      });
      
      // 4. Generate pattern
      const genSpinner = ora('Generating pattern...').start();
      genSpinner.text = 'Analyzing requirements...';
      
      const pattern = await generator.generate(requirements);
      
      genSpinner.succeed('Pattern generated successfully!');
      
      // 5. Display pattern info
      console.log('\n' + chalk.bold('Generated Pattern:'));
      console.log(chalk.gray('  Name:'), pattern.name);
      console.log(chalk.gray('  Version:'), pattern.version);
      console.log(chalk.gray('  Primitives:'), pattern.metadata.primitives.join(', '));
      console.log(chalk.gray('  Complexity:'), pattern.metadata.complexity);
      console.log(chalk.gray('  Est. Agents:'), pattern.metadata.estimatedAgents);
      
      // 6. Save pattern (unless dry-run)
      if (!options.dryRun) {
        const saveSpinner = ora('Saving pattern...').start();
        const savedPath = await generator.save(
          pattern,
          options.output
        );
        saveSpinner.succeed(`Pattern saved to: ${chalk.green(savedPath)}`);
        
        // 7. Validate pattern
        const validateSpinner = ora('Validating pattern...').start();
        let validation = await generator.validate(pattern);
        
        if (validation.isValid) {
          validateSpinner.succeed('Pattern is valid');
        } else {
          validateSpinner.warn('Pattern has validation issues');
          validation.errors.forEach(err => {
            console.log(chalk.red(`  ✗ ${err.message}`));
          });
          
          // Try auto-fix
          console.log(chalk.yellow('\n🔧 Attempting to auto-fix issues...'));
          const fixedPattern = await generator.autoFix(pattern);
          
          // Re-validate
          validation = await generator.validate(fixedPattern);
          if (validation.isValid) {
            console.log(chalk.green('✅ Auto-fix successful!'));
            // Save the fixed pattern
            await generator.save(fixedPattern, options.output);
          } else {
            console.log(chalk.red('❌ Some issues could not be auto-fixed'));
          }
        }
        
        if (validation.warnings.length > 0) {
          console.log(chalk.yellow('\nWarnings:'));
          validation.warnings.forEach(warn => {
            console.log(chalk.yellow(`  ⚠ ${warn.message}`));
          });
        }
      } else {
        console.log(chalk.gray('\n(Dry run - pattern not saved)'));
        console.log('\n' + chalk.bold('Generated Code:'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(pattern.code);
        console.log(chalk.gray('─'.repeat(60)));
      }
      
    } catch (error) {
      console.error(chalk.red('\nError generating pattern:'), error);
      process.exit(1);
    }
  });