/**
 * Template management command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { templates } from '../../templates';

export const templateCommand = new Command('template')
  .description('Work with pattern templates')
  .addCommand(
    new Command('list')
      .description('List available templates')
      .action(() => {
        console.log(chalk.bold('\nAvailable Pattern Templates:\n'));
        
        Object.entries(templates).forEach(([name, template]) => {
          console.log(chalk.green(`  ${name}`));
          console.log(chalk.gray(`    ${template.description}`));
          console.log(chalk.gray(`    Primitives: ${template.defaultPrimitives.join(', ')}`));
          console.log();
        });
      })
  )
  .addCommand(
    new Command('show')
      .description('Show template details')
      .argument('<name>', 'Template name')
      .action((name) => {
        const template = templates[name];
        
        if (!template) {
          console.error(chalk.red(`Template "${name}" not found`));
          console.log(chalk.gray('\nAvailable templates:'), Object.keys(templates).join(', '));
          process.exit(1);
        }
        
        console.log(chalk.bold(`\nTemplate: ${name}\n`));
        console.log(chalk.gray('Description:'), template.description);
        console.log(chalk.gray('Min Agents:'), template.minAgents);
        console.log(chalk.gray('Default Confidence:'), template.defaultConfidence);
        console.log(chalk.gray('Primitives:'), template.defaultPrimitives.join(', '));
        
        if (template.example) {
          console.log('\n' + chalk.bold('Example:'));
          console.log(chalk.gray('─'.repeat(60)));
          console.log(template.example);
          console.log(chalk.gray('─'.repeat(60)));
        }
      })
  );