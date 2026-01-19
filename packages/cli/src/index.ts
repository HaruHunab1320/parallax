#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { startCommand, stopCommand } from './commands/start';
import { agentCommand } from './commands/agent';
import { runCommand } from './commands/run';
import { patternCommand } from './commands/pattern';
import { statusCommand } from './commands/status';
import { scenarioCommand } from './commands/scenario';
import { demoCommand } from './commands/demo';

const program = new Command();

// ASCII art banner
const banner = chalk.cyan(`
╔═══════════════════════════════════════╗
║      ____                 _ _         ║
║     |  _ \\ __ _ _ __ __ _| | | __ ___║
║     | |_) / _\` | '__/ _\` | | |/ _\` \\ \\/ /║
║     |  __/ (_| | | | (_| | | | (_| |>  <║
║     |_|   \\__,_|_|  \\__,_|_|_|\\__,_/_/\\_\\║
║                                       ║
║   AI Orchestration with Uncertainty   ║
╚═══════════════════════════════════════╝
`);

console.log(banner);

program
  .name('parallax')
  .description('CLI for Parallax AI orchestration platform')
  .version('0.1.0');

// Add commands
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(agentCommand);
program.addCommand(runCommand);
program.addCommand(patternCommand);
program.addCommand(statusCommand);
program.addCommand(scenarioCommand);
program.addCommand(demoCommand);

// Parse command line arguments
program.parse();
