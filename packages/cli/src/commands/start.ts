import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

export const startCommand = new Command('start')
  .description('Start the Parallax platform locally')
  .option('-d, --detached', 'Run in background')
  .option('--control-plane-only', 'Start only control plane')
  .option('--data-plane-only', 'Start only data plane')
  .option('-p, --port <port>', 'Control plane port', '3000')
  .option('--etcd <url>', 'etcd endpoint', 'localhost:2379')
  .option('--patterns <dir>', 'Patterns directory', './patterns')
  .action(async (options) => {
    const spinner = ora('Starting Parallax platform...').start();
    const processes: ChildProcess[] = [];

    try {
      // Set environment variables
      process.env.PARALLAX_ETCD_ENDPOINTS = options.etcd;
      process.env.PARALLAX_PATTERNS_DIR = path.resolve(options.patterns);
      process.env.PORT = options.port;
      
      // Check if patterns directory exists
      try {
        await fs.access(process.env.PARALLAX_PATTERNS_DIR);
      } catch {
        spinner.fail(chalk.red(`Patterns directory not found: ${process.env.PARALLAX_PATTERNS_DIR}`));
        console.log(chalk.yellow('Create it or specify a different directory with --patterns'));
        process.exit(1);
      }

      // Start control plane
      if (!options.dataPlaneOnly) {
        spinner.text = 'Starting control plane...';
        
        const controlPlanePath = path.join(__dirname, '../../../../control-plane');
        const controlPlane = spawn('pnpm', ['dev'], {
          cwd: controlPlanePath,
          env: { ...process.env },
          stdio: options.detached ? 'ignore' : 'inherit',
          detached: options.detached
        });
        
        processes.push(controlPlane);
        
        // Wait for control plane to start
        await waitForService(`http://localhost:${options.port}/health`, 'Control Plane');
      }

      spinner.succeed(chalk.green('Parallax platform started successfully!'));
      
      console.log('\n' + chalk.cyan('Platform endpoints:'));
      console.log(chalk.gray('  Control Plane API: ') + chalk.white(`http://localhost:${options.port}`));
      console.log(chalk.gray('  Health Check:      ') + chalk.white(`http://localhost:${options.port}/health`));
      console.log(chalk.gray('  Patterns:          ') + chalk.white(`http://localhost:${options.port}/api/patterns`));
      console.log(chalk.gray('  Agents:            ') + chalk.white(`http://localhost:${options.port}/api/agents`));
      
      console.log('\n' + chalk.cyan('Quick Start:'));
      console.log(chalk.gray('  1. Start an agent:     ') + chalk.white('parallax agent start <agent-path>'));
      console.log(chalk.gray('  2. List patterns:      ') + chalk.white('parallax pattern list'));
      console.log(chalk.gray('  3. Execute a pattern:  ') + chalk.white('parallax run <pattern-name>'));
      
      if (!options.detached) {
        console.log('\n' + chalk.yellow('Press Ctrl+C to stop'));
        
        // Handle shutdown
        const shutdown = () => {
          console.log('\n' + chalk.red('Shutting down Parallax...'));
          processes.forEach(p => {
            try {
              process.kill(-p.pid!);
            } catch (e) {
              // Process might already be dead
            }
          });
          process.exit(0);
        };
        
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        
        // Keep process running
        await new Promise(() => {});
      } else {
        console.log('\n' + chalk.gray('Running in detached mode. Use "parallax stop" to shut down.'));
        
        // Store PIDs for later shutdown
        const pidFile = path.join(process.cwd(), '.parallax.pids');
        await fs.writeFile(pidFile, processes.map(p => p.pid).join('\n'));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to start Parallax platform'));
      console.error(error);
      
      // Clean up any started processes
      processes.forEach(p => p.kill());
      
      process.exit(1);
    }
  });

async function waitForService(url: string, name: string, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (e) {
      // Service not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`${name} failed to start after ${maxRetries} seconds`);
}

// Add stop command
export const stopCommand = new Command('stop')
  .description('Stop the Parallax platform')
  .action(async () => {
    const spinner = ora('Stopping Parallax platform...').start();
    
    try {
      const pidFile = path.join(process.cwd(), '.parallax.pids');
      
      try {
        const pids = await fs.readFile(pidFile, 'utf-8');
        const pidList = pids.split('\n').filter(p => p);
        
        pidList.forEach(pid => {
          try {
            process.kill(parseInt(pid));
          } catch (e) {
            // Process might already be dead
          }
        });
        
        await fs.unlink(pidFile);
        spinner.succeed(chalk.green('Parallax platform stopped'));
      } catch (e) {
        spinner.fail(chalk.yellow('No running Parallax instance found'));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to stop Parallax'));
      console.error(error);
    }
  });