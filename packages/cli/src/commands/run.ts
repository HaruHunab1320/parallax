import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ParallaxHttpClient } from '../utils/http-client';

export const runCommand = new Command('run')
  .description('Run a coordination pattern')
  .argument('<pattern>', 'Pattern name or path to .prism file')
  .option('-i, --input <data>', 'Input data (JSON string)')
  .option('-f, --file <path>', 'Input data file')
  .option('--min-confidence <value>', 'Minimum confidence threshold', '0.7')
  .option('--timeout <ms>', 'Execution timeout in milliseconds', '30000')
  .option('-w, --watch', 'Watch pattern file for changes')
  .action(async (pattern, options) => {
    const spinner = ora('Preparing pattern execution...').start();
    
    try {
      // Parse input data
      let inputData: any = { task: 'Execute pattern', data: {} };
      
      if (options.file) {
        spinner.text = 'Reading input file...';
        const fileContent = await fs.readFile(options.file, 'utf-8');
        inputData = JSON.parse(fileContent);
      } else if (options.input) {
        inputData = JSON.parse(options.input);
      }
      
      spinner.text = 'Connecting to Parallax...';
      const client = new ParallaxHttpClient();
      
      // Determine pattern name
      let patternName: string;
      if (pattern.endsWith('.prism')) {
        // Extract name from file
        patternName = path.basename(pattern, '.prism');
        console.log(chalk.yellow('Note: Running from file not yet supported. Using pattern name: ' + patternName));
      } else {
        patternName = pattern;
      }
      
      spinner.text = `Executing pattern '${patternName}'...`;
      
      // Execute pattern
      const startTime = Date.now();
      const result = await client.executePattern(patternName, inputData, {
        timeout: parseInt(options.timeout)
      });
      const executionTime = Date.now() - startTime;
      
      spinner.succeed(chalk.green('Pattern executed successfully!'));
      
      // Display results
      console.log('\n' + chalk.cyan('Execution Results:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('Pattern: ') + chalk.cyan(patternName));
      console.log(chalk.white('Status: ') + chalk.green(result.status.toUpperCase()));
      console.log(chalk.white('Execution Time: ') + `${executionTime}ms`);
      
      if (result.confidence !== undefined) {
        console.log(chalk.white('Confidence: ') + chalk.yellow(result.confidence.toFixed(2)));
        
        // Check minimum confidence
        const minConfidence = parseFloat(options.minConfidence);
        if (result.confidence < minConfidence) {
          console.log(chalk.yellow(`\n⚠ Warning: Confidence ${result.confidence.toFixed(2)} is below threshold ${minConfidence}`));
        }
      }
      
      console.log('\n' + chalk.cyan('Result:'));
      console.log(JSON.stringify(result.result, null, 2));
      
      // Show agent participation if available
      if (result.result && result.result.agents) {
        console.log('\n' + chalk.cyan('Agent Participation:'));
        console.log(chalk.gray('─'.repeat(50)));
        
        if (Array.isArray(result.result.agents)) {
          result.result.agents.forEach((agent: any) => {
            const conf = agent.confidence || agent.result?.confidence;
            console.log(
              chalk.white('• ') + 
              chalk.gray(agent.id || agent.name || 'Unknown') + 
              (conf !== undefined ? chalk.yellow(` (confidence: ${conf.toFixed(2)})`) : '')
            );
          });
        }
      }
      
      // Watch mode
      if (options.watch && pattern.endsWith('.prism')) {
        console.log('\n' + chalk.yellow(`Watching ${pattern} for changes...`));
        console.log(chalk.gray('Press Ctrl+C to stop'));
        
        // Simple file watcher
        const watchFile = async () => {
          const { watchFile } = await import('fs');
          watchFile(pattern, async () => {
            console.log(chalk.blue(`\n${new Date().toISOString()} - File changed, re-executing...`));
            
            try {
              const result = await client.executePattern(patternName, inputData);
              console.log(chalk.green('✓ Re-execution complete'));
              console.log('Result:', JSON.stringify(result.result, null, 2));
            } catch (error) {
              console.error(chalk.red('✗ Re-execution failed:'), error);
            }
          });
        };
        
        await watchFile();
        
        // Keep process alive
        process.stdin.resume();
      }
    } catch (error) {
      spinner.fail(chalk.red('Pattern execution failed'));
      console.error(error);
      process.exit(1);
    }
  });