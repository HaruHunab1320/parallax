import { Command } from 'commander';
import chalk from 'chalk';
import { table } from 'table';
import inquirer from 'inquirer';
import ora from 'ora';
import { ParallaxHttpClient } from '../utils/http-client';

interface AgentInfo {
  id: string;
  name: string;
  capabilities?: string[];
  endpoint?: string;
  status: string;
}

export const agentCommand = new Command('agent')
  .description('Manage Parallax agents');

// List agents subcommand
agentCommand
  .command('list')
  .description('List registered agents')
  .option('-c, --capabilities <caps...>', 'Filter by capabilities')
  .action(async (options) => {
    const spinner = ora('Fetching agents...').start();
    
    try {
      const client = new ParallaxHttpClient();
      const agents = await client.listAgents();
      
      spinner.stop();
      
      // Filter by capabilities if requested
      let filteredAgents = agents;
      if (options.capabilities) {
        filteredAgents = agents.filter((agent: AgentInfo) => 
          options.capabilities.some((cap: string) => 
            agent.capabilities?.includes(cap)
          )
        );
      }
      
      if (filteredAgents.length === 0) {
        console.log(chalk.yellow('No agents found'));
        return;
      }
      
      const tableData = [
        ['ID', 'Name', 'Capabilities', 'Status', 'Endpoint'],
        ...filteredAgents.map((agent: AgentInfo) => [
          chalk.cyan(agent.id),
          agent.name,
          agent.capabilities?.join(', ') || '',
          agent.status === 'healthy' ? chalk.green('●') : chalk.red('●'),
          chalk.gray(agent.endpoint || 'local')
        ])
      ];
      
      console.log(table(tableData));
      console.log(chalk.gray(`Total agents: ${filteredAgents.length}`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch agents'));
      console.error(error);
    }
  });

// Get agent details
agentCommand
  .command('status <agent-id>')
  .description('Get detailed status of an agent')
  .action(async (agentId) => {
    const spinner = ora('Fetching agent status...').start();
    
    try {
      const client = new ParallaxHttpClient();
      const agent = await client.getAgent(agentId);
      const health = await client.getAgentHealth(agentId);
      
      spinner.stop();
      
      console.log(chalk.cyan(`\nAgent: ${agent.name}`));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('ID: ') + agent.id);
      console.log(chalk.white('Status: ') + (health.status === 'healthy' ? chalk.green('Online') : chalk.red('Offline')));
      console.log(chalk.white('Capabilities: ') + (agent.capabilities?.join(', ') || 'None'));
      if (agent.endpoint) {
        console.log(chalk.white('Endpoint: ') + agent.endpoint);
      }
      console.log();
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch agent status'));
      console.error(error);
    }
  });

// Test agent interactively
agentCommand
  .command('test <agent-id>')
  .description('Test an agent interactively')
  .action(async (agentId) => {
    console.log(chalk.cyan(`Testing agent: ${agentId}\n`));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'task',
        message: 'Enter task description:',
        default: 'Analyze this'
      },
      {
        type: 'editor',
        name: 'data',
        message: 'Enter test data (JSON):',
        default: '{}'
      }
    ]);
    
    const spinner = ora('Sending request to agent...').start();
    
    try {
      const client = new ParallaxHttpClient();
      
      // Parse JSON data
      let data;
      try {
        data = JSON.parse(answers.data);
      } catch (e) {
        spinner.fail(chalk.red('Invalid JSON data'));
        return;
      }
      
      const testResult = await client.testAgent(agentId, answers.task, data);
      const result = testResult.result;
      
      spinner.succeed('Agent responded');
      
      console.log('\n' + chalk.cyan('Result:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('Value: ') + JSON.stringify(result.value, null, 2));
      console.log(chalk.white('Confidence: ') + chalk.yellow(result.confidence.toFixed(2)));
      
      if (result.reasoning) {
        console.log(chalk.white('Reasoning: ') + chalk.gray(result.reasoning));
      }
      
      if (result.uncertainties && result.uncertainties.length > 0) {
        console.log(chalk.white('Uncertainties:'));
        result.uncertainties.forEach((u: string) => 
          console.log(chalk.gray(`  - ${u}`))
        );
      }
    } catch (error) {
      spinner.fail(chalk.red('Agent request failed'));
      console.error(error);
    }
  });

// Get agent capabilities
agentCommand
  .command('capabilities')
  .description('List all unique capabilities across agents')
  .action(async () => {
    const spinner = ora('Analyzing capabilities...').start();
    
    try {
      const client = new ParallaxHttpClient();
      const agents = await client.listAgents() as AgentInfo[];
      
      spinner.stop();
      
      // Extract unique capabilities
      const capabilityMap = new Map<string, number>();
      agents.forEach((agent: AgentInfo) => {
        (agent.capabilities || []).forEach((cap: string) => {
          capabilityMap.set(cap, (capabilityMap.get(cap) || 0) + 1);
        });
      });
      
      const capabilities = Array.from(capabilityMap.entries())
        .sort((a, b) => b[1] - a[1]);
      
      console.log(chalk.cyan('\nAvailable Capabilities:'));
      console.log(chalk.gray('─'.repeat(50)));
      
      capabilities.forEach(([cap, count]) => {
        const bar = '█'.repeat(count * 2);
        console.log(
          chalk.white(cap.padEnd(20)) + 
          chalk.green(bar) + 
          chalk.gray(` (${count} agents)`)
        );
      });
    } catch (error) {
      spinner.fail(chalk.red('Failed to analyze capabilities'));
      console.error(error);
    }
  });
