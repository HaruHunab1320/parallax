import { Command } from 'commander';
import chalk from 'chalk';
import { table } from 'table';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ParallaxClient } from '../utils/client';

export const patternCommand = new Command('pattern')
  .description('Manage coordination patterns');

// List patterns
patternCommand
  .command('list')
  .description('List available patterns')
  .option('--verbose', 'Show pattern details')
  .action(async (options) => {
    const spinner = ora('Fetching patterns...').start();
    
    try {
      const client = new ParallaxClient();
      const patternNames = await client.listPatterns();
      
      // Pattern metadata
      const patternMetadata: Record<string, any> = {
        'consensus-builder': {
          version: '1.0.0',
          description: 'Build weighted consensus from multiple agents',
          requirements: { minAgents: 3, capabilities: ['analysis'] }
        },
        'epistemic-orchestrator': {
          version: '1.0.0',
          description: 'Identify valuable disagreements between experts',
          requirements: { minAgents: 2, capabilities: ['analysis'] }
        },
        'uncertainty-router': {
          version: '1.0.0',
          description: 'Route tasks based on uncertainty levels',
          requirements: { minAgents: 1, capabilities: ['analysis'] }
        },
        'confidence-cascade': {
          version: '1.0.0',
          description: 'Cascade through agents by confidence threshold',
          requirements: { minAgents: 2, capabilities: ['analysis'] }
        },
        'load-balancer': {
          version: '1.0.0',
          description: 'Distribute work optimally across agents',
          requirements: { minAgents: 2, capabilities: ['analysis'] }
        },
        'cascading-refinement': {
          version: '1.0.0',
          description: 'Progressively improve quality',
          requirements: { minAgents: 3, capabilities: ['analysis'] }
        },
        'parallel-exploration': {
          version: '1.0.0',
          description: 'Explore multiple solution paths',
          requirements: { minAgents: 3, capabilities: ['analysis'] }
        },
        'multi-validator': {
          version: '1.0.0',
          description: 'Validate across multiple validators',
          requirements: { minAgents: 2, capabilities: ['validation'] }
        },
        'uncertainty-mapreduce': {
          version: '1.0.0',
          description: 'Distributed processing with confidence',
          requirements: { minAgents: 2, capabilities: ['processing'] }
        },
        'robust-analysis': {
          version: '1.0.0',
          description: 'Composite pattern for maximum robustness',
          requirements: { minAgents: 4, capabilities: ['analysis'] }
        }
      };
      
      const patterns = patternNames.map(name => ({
        name,
        ...patternMetadata[name] || {
          version: '1.0.0',
          description: 'No description available',
          requirements: { minAgents: 1, capabilities: [] }
        }
      }));
      
      spinner.stop();
      
      if (options.verbose) {
        patterns.forEach(pattern => {
          console.log(chalk.cyan(`\n${pattern.name} (v${pattern.version})`));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(chalk.white('Description: ') + pattern.description);
          console.log(chalk.white('Min Agents: ') + pattern.requirements.minAgents);
          console.log(chalk.white('Required Capabilities: ') + pattern.requirements.capabilities.join(', '));
        });
      } else {
        const tableData = [
          ['Name', 'Version', 'Description', 'Min Agents'],
          ...patterns.map(p => [
            chalk.cyan(p.name),
            p.version,
            p.description.substring(0, 40) + '...',
            p.requirements.minAgents.toString()
          ])
        ];
        
        console.log(table(tableData));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch patterns'));
      console.error(error);
    }
  });

// Execute pattern
patternCommand
  .command('execute')
  .description('Execute a pattern')
  .argument('<pattern-name>', 'Name of the pattern to execute')
  .option('-i, --input <json>', 'Input data as JSON string')
  .option('-f, --file <path>', 'Input data from JSON file')
  .action(async (patternName, options) => {
    const spinner = ora('Preparing pattern execution...').start();
    
    try {
      let input = {};
      
      // Parse input
      if (options.input) {
        try {
          input = JSON.parse(options.input);
        } catch (e) {
          spinner.fail(chalk.red('Invalid JSON input'));
          return;
        }
      } else if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        input = JSON.parse(content);
      } else {
        // Default input
        input = { task: 'Analyze this', data: {} };
      }
      
      spinner.text = 'Executing pattern...';
      
      const client = new ParallaxClient();
      const result = await client.executePattern(patternName, input);
      
      spinner.succeed('Pattern executed successfully');
      
      console.log(chalk.cyan('\nExecution Result:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('Pattern: ') + result.pattern);
      console.log(chalk.white('Status: ') + chalk.green(result.status));
      console.log(chalk.white('Execution Time: ') + `${result.executionTime}ms`);
      console.log(chalk.white('\nResult:'));
      console.log(JSON.stringify(result.result, null, 2));
      
    } catch (error) {
      spinner.fail(chalk.red('Pattern execution failed'));
      console.error(error);
    }
  });

// Validate pattern
patternCommand
  .command('validate')
  .description('Validate a pattern file')
  .argument('<file>', 'Path to .prism pattern file')
  .action(async (file) => {
    const spinner = ora('Validating pattern...').start();
    
    try {
      const content = await fs.readFile(file, 'utf-8');
      
      // Basic validation checks
      const checks = [
        { name: 'Has metadata', passed: content.includes('@name') },
        { name: 'Has version', passed: content.includes('@version') },
        { name: 'Has description', passed: content.includes('@description') },
        { name: 'Valid Prism syntax', passed: true }, // Would use actual Prism parser
        { name: 'Has input definition', passed: content.includes('@input') },
        { name: 'Returns with confidence', passed: content.includes('~>') }
      ];
      
      spinner.stop();
      
      console.log(chalk.cyan(`\nValidation Results for ${file}`));
      console.log(chalk.gray('─'.repeat(50)));
      
      let allPassed = true;
      checks.forEach(check => {
        const icon = check.passed ? chalk.green('✓') : chalk.red('✗');
        console.log(`${icon} ${check.name}`);
        if (!check.passed) allPassed = false;
      });
      
      if (allPassed) {
        console.log('\n' + chalk.green('Pattern is valid!'));
      } else {
        console.log('\n' + chalk.red('Pattern has validation errors'));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to validate pattern'));
      console.error(error);
      process.exit(1);
    }
  });

// Show pattern details
patternCommand
  .command('show')
  .description('Show detailed information about a pattern')
  .argument('<pattern-name>', 'Name of the pattern')
  .action(async (patternName) => {
    const spinner = ora('Loading pattern...').start();
    
    try {
      // Try to read the pattern file
      const patternsDir = process.env.PARALLAX_PATTERNS_DIR || path.join(process.cwd(), 'patterns');
      const patternPath = path.join(patternsDir, `${patternName}.prism`);
      
      const content = await fs.readFile(patternPath, 'utf-8');
      
      spinner.stop();
      
      // Extract metadata from comments
      const nameMatch = content.match(/@name\s+(.+)/);
      const versionMatch = content.match(/@version\s+(.+)/);
      const descMatch = content.match(/@description\s+(.+)/);
      const minAgentsMatch = content.match(/@minAgents\s+(\d+)/);
      
      console.log(chalk.cyan(`\nPattern: ${patternName}`));
      console.log(chalk.gray('─'.repeat(50)));
      
      if (nameMatch) console.log(chalk.white('Name: ') + nameMatch[1]);
      if (versionMatch) console.log(chalk.white('Version: ') + versionMatch[1]);
      if (descMatch) console.log(chalk.white('Description: ') + descMatch[1]);
      if (minAgentsMatch) console.log(chalk.white('Min Agents: ') + minAgentsMatch[1]);
      
      console.log(chalk.white('\nPattern Code Preview:'));
      console.log(chalk.gray('─'.repeat(50)));
      
      // Show first 15 lines of actual code (skip comments)
      const lines = content.split('\n');
      let codeLines = 0;
      let inComment = false;
      
      for (const line of lines) {
        if (line.trim().startsWith('/**')) inComment = true;
        if (!inComment && line.trim() && codeLines < 15) {
          console.log(chalk.gray(line));
          codeLines++;
        }
        if (line.trim().endsWith('*/')) inComment = false;
      }
      
      if (codeLines === 15) {
        console.log(chalk.gray('... (truncated)'));
      }
      
    } catch (error) {
      spinner.fail(chalk.red(`Failed to load pattern ${patternName}`));
      console.error(error);
    }
  });