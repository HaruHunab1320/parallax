import * as fs from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { ParallaxHttpClient } from '../utils/http-client';

export const runCommand = new Command('run')
  .description('Run a coordination pattern')
  .argument('<pattern>', 'Pattern name')
  .option('-i, --input <data>', 'Input data (JSON string)')
  .option('-f, --file <path>', 'Input data file')
  .option('--min-confidence <value>', 'Minimum confidence threshold', '0.7')
  .option('--timeout <ms>', 'Execution timeout in milliseconds', '30000')
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

      const patternName = pattern;

      spinner.text = `Executing pattern '${patternName}'...`;

      // Execute pattern
      const startTime = Date.now();
      const result = await client.executePattern(patternName, inputData, {
        timeout: parseInt(options.timeout, 10),
      });
      const executionTime = Date.now() - startTime;

      spinner.succeed(chalk.green('Pattern executed successfully!'));

      // Display results
      console.log(`\n${chalk.cyan('Execution Results:')}`);
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('Pattern: ') + chalk.cyan(patternName));
      console.log(
        chalk.white('Status: ') + chalk.green(result.status.toUpperCase())
      );
      console.log(`${chalk.white('Execution Time: ')}${executionTime}ms`);

      if (result.confidence !== undefined) {
        console.log(
          chalk.white('Confidence: ') +
            chalk.yellow(result.confidence.toFixed(2))
        );

        // Check minimum confidence
        const minConfidence = parseFloat(options.minConfidence);
        if (result.confidence < minConfidence) {
          console.log(
            chalk.yellow(
              `\n⚠ Warning: Confidence ${result.confidence.toFixed(2)} is below threshold ${minConfidence}`
            )
          );
        }
      }

      console.log(`\n${chalk.cyan('Result:')}`);
      console.log(JSON.stringify(result.result, null, 2));

      // Show agent participation if available
      if (result.result?.agents) {
        console.log(`\n${chalk.cyan('Agent Participation:')}`);
        console.log(chalk.gray('─'.repeat(50)));

        if (Array.isArray(result.result.agents)) {
          result.result.agents.forEach((agent: any) => {
            const conf = agent.confidence || agent.result?.confidence;
            console.log(
              chalk.white('• ') +
                chalk.gray(agent.id || agent.name || 'Unknown') +
                (conf !== undefined
                  ? chalk.yellow(` (confidence: ${conf.toFixed(2)})`)
                  : '')
            );
          });
        }
      }

    } catch (error) {
      spinner.fail(chalk.red('Pattern execution failed'));
      console.error(error);
      process.exit(1);
    }
  });
