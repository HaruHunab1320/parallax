#!/usr/bin/env node

/**
 * Parallax Pattern SDK CLI
 * Generate orchestration patterns at development time
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { patternCommand } from './commands/pattern';
import { templateCommand } from './commands/template';
import { validateCommand } from './commands/validate';

const program = new Command();

program
  .name('parallax-generate')
  .description('Generate Parallax orchestration patterns using AI')
  .version('0.1.0')
  .addHelpText('after', `
${chalk.gray('Examples:')}
  ${chalk.green('$')} parallax-generate pattern "Multi-stage review with consensus"
  ${chalk.green('$')} parallax-generate pattern --interactive
  ${chalk.green('$')} parallax-generate pattern -f requirements.yaml
  ${chalk.green('$')} parallax-generate template list
  ${chalk.green('$')} parallax-generate validate ./patterns/review.prism
  `);

// Add commands
program.addCommand(patternCommand);
program.addCommand(templateCommand);
program.addCommand(validateCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}