import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { ParallaxClient } from '../utils/client';

export const statusCommand = new Command('status')
  .description('Check Parallax platform status')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Checking platform status...').start();
    
    try {
      const client = new ParallaxClient();
      
      // Get real status
      spinner.text = 'Checking agents...';
      const agents = await client.listAgents();
      const availableAgents = agents.filter(a => a.available);
      
      spinner.text = 'Checking patterns...';
      const patterns = await client.listPatterns();
      
      const status = {
        platform: {
          version: '0.1.0',
          status: availableAgents.length > 0 ? 'healthy' : 'degraded'
        },
        services: {
          controlPlane: {
            patternEngine: { 
              status: patterns.length > 0 ? 'online' : 'offline', 
              health: patterns.length > 0 ? 'healthy' : 'unhealthy' 
            },
            agentRegistry: { 
              status: 'online', 
              health: agents.length > 0 ? 'healthy' : 'degraded' 
            }
          },
          agents: {
            total: agents.length,
            available: availableAgents.length,
            offline: agents.length - availableAgents.length
          }
        },
        metrics: {
          registeredAgents: agents.length,
          activeAgents: availableAgents.length,
          patternsLoaded: patterns.length,
          capabilities: [...new Set(agents.flatMap(a => a.capabilities))].length
        }
      };
      
      spinner.stop();
      
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      
      // Platform Overview
      console.log(chalk.cyan('\nParallax Platform Status'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('Version: ') + chalk.cyan(status.platform.version));
      console.log(chalk.white('Status: ') + 
        (status.platform.status === 'healthy' ? chalk.green(status.platform.status) : chalk.yellow(status.platform.status))
      );
      
      // Services Status
      console.log('\n' + chalk.cyan('Services:'));
      
      const serviceTableData: any[] = [
        ['Component', 'Status', 'Health']
      ];
      
      Object.entries(status.services.controlPlane).forEach(([name, info]: [string, any]) => {
        serviceTableData.push([
          name,
          info.status === 'online' ? chalk.green('●') : chalk.red('●'),
          info.health === 'healthy' ? chalk.green(info.health) :
          info.health === 'degraded' ? chalk.yellow(info.health) :
          chalk.red(info.health)
        ]);
      });
      
      console.log(table(serviceTableData));
      
      // Agent Status
      console.log(chalk.cyan('Agents:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('Total Registered: ') + status.services.agents.total);
      console.log(chalk.white('Available: ') + chalk.green(status.services.agents.available.toString()));
      console.log(chalk.white('Offline: ') + 
        (status.services.agents.offline > 0 ? chalk.red(status.services.agents.offline.toString()) : '0')
      );
      
      // Metrics
      console.log('\n' + chalk.cyan('Platform Metrics:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('Patterns Available: ') + status.metrics.patternsLoaded);
      console.log(chalk.white('Unique Capabilities: ') + status.metrics.capabilities);
      
      // Pattern List
      if (patterns.length > 0 && patterns.length <= 5) {
        console.log(chalk.white('Patterns: ') + chalk.gray(patterns.join(', ')));
      }
      
      // Warnings
      if (status.services.agents.available === 0) {
        console.log('\n' + chalk.yellow('⚠ No agents available. Pattern execution will fail.'));
        console.log(chalk.gray('  Start agents or set PARALLAX_LOCAL_AGENTS environment variable'));
      } else if (status.services.agents.available < 3) {
        console.log('\n' + chalk.yellow('⚠ Limited agents available. Some patterns may not execute.'));
      }
      
      if (status.metrics.patternsLoaded === 0) {
        console.log('\n' + chalk.yellow('⚠ No patterns loaded. Check PARALLAX_PATTERNS_DIR'));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to check platform status'));
      console.error(error);
      process.exit(1);
    }
  });