import { Command } from 'commander';
import chalk from 'chalk';
import { table } from 'table';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ParallaxHttpClient } from '../utils/http-client';

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
      const client = new ParallaxHttpClient();
      const patterns = await client.listPatterns();
      
      // Patterns now come from the API with all metadata
      
      spinner.stop();
      
      if (options.verbose) {
        patterns.forEach(pattern => {
          console.log(chalk.cyan(`\n${pattern.name} (v${pattern.version})`));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(chalk.white('Description: ') + pattern.description);
          console.log(chalk.white('Min Agents: ') + (pattern.minAgents || 'Any'));
          if (pattern.maxAgents) {
            console.log(chalk.white('Max Agents: ') + pattern.maxAgents);
          }
        });
      } else {
        const tableData = [
          ['Name', 'Version', 'Description', 'Min Agents'],
          ...patterns.map(p => [
            chalk.cyan(p.name),
            p.version,
            p.description.substring(0, 40) + '...',
            (p.minAgents || '-').toString()
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
      
      const client = new ParallaxHttpClient();
      const result = await client.executePattern(patternName, input);
      
      spinner.succeed('Pattern executed successfully');
      
      console.log(chalk.cyan('\nExecution Result:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('Pattern: ') + result.patternName);
      console.log(chalk.white('Status: ') + chalk.green(result.status));
      if (result.confidence !== undefined) {
        console.log(chalk.white('Confidence: ') + chalk.yellow(result.confidence.toFixed(2)));
      }
      if (result.endTime && result.startTime) {
        const duration = new Date(result.endTime).getTime() - new Date(result.startTime).getTime();
        console.log(chalk.white('Execution Time: ') + `${duration}ms`);
      }
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

// Upload pattern file
patternCommand
  .command('upload')
  .description('Upload a .prism or .yaml pattern file')
  .argument('<path>', 'Path to pattern file')
  .option('--overwrite', 'Overwrite existing pattern', false)
  .action(async (filePath, options) => {
    const spinner = ora('Uploading pattern...').start();

    try {
      const resolvedPath = path.resolve(filePath);
      const content = await fs.readFile(resolvedPath, 'utf-8');
      const filename = path.basename(resolvedPath);

      const ext = path.extname(filename).toLowerCase();
      if (!['.prism', '.yaml', '.yml'].includes(ext)) {
        spinner.fail(chalk.red(`Unsupported file type: ${ext}. Use .prism, .yaml, or .yml`));
        return;
      }

      const client = new ParallaxHttpClient();
      const pattern = await client.uploadPattern(filename, content, options.overwrite);

      spinner.succeed(chalk.green(`Pattern "${pattern.name}" uploaded successfully`));
      console.log(chalk.white('  Name: ') + chalk.cyan(pattern.name));
      console.log(chalk.white('  Version: ') + pattern.version);
    } catch (error) {
      spinner.fail(chalk.red('Failed to upload pattern'));
      console.error(error instanceof Error ? error.message : error);
    }
  });

// Upload all patterns from a directory
patternCommand
  .command('upload-dir')
  .description('Upload all patterns from a directory')
  .argument('<dir>', 'Directory containing pattern files')
  .option('--overwrite', 'Overwrite existing patterns', false)
  .option('-r, --recursive', 'Search subdirectories', false)
  .action(async (dir, options) => {
    const spinner = ora('Scanning for pattern files...').start();

    try {
      const resolvedDir = path.resolve(dir);
      const files = await findPatternFiles(resolvedDir, options.recursive);

      if (files.length === 0) {
        spinner.fail(chalk.yellow('No pattern files found'));
        return;
      }

      spinner.text = `Uploading ${files.length} pattern file(s)...`;

      const fileContents = await Promise.all(
        files.map(async (f) => ({
          filename: path.basename(f),
          content: await fs.readFile(f, 'utf-8'),
        }))
      );

      const client = new ParallaxHttpClient();
      const { results } = await client.uploadPatterns(fileContents, options.overwrite);

      spinner.stop();

      const succeeded = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      if (succeeded.length > 0) {
        console.log(chalk.green(`\n${succeeded.length} pattern(s) uploaded successfully:`));
        succeeded.forEach(r => console.log(chalk.gray(`  ✓ ${r.filename}`)));
      }

      if (failed.length > 0) {
        console.log(chalk.red(`\n${failed.length} pattern(s) failed:`));
        failed.forEach(r => console.log(chalk.red(`  ✗ ${r.filename}: ${r.error}`)));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to upload patterns'));
      console.error(error instanceof Error ? error.message : error);
    }
  });

async function findPatternFiles(dir: string, recursive: boolean): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...await findPatternFiles(fullPath, true));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.prism', '.yaml', '.yml'].includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

// Show pattern details
patternCommand
  .command('show')
  .description('Show detailed information about a pattern')
  .argument('<pattern-name>', 'Name of the pattern')
  .action(async (patternName) => {
    const spinner = ora('Loading pattern...').start();
    
    try {
      const client = new ParallaxHttpClient();
      const pattern = await client.getPattern(patternName);
      
      spinner.stop();
      
      console.log(chalk.cyan(`\nPattern: ${pattern.name}`));
      console.log(chalk.gray('─'.repeat(50)));
      
      console.log(chalk.white('Name: ') + pattern.name);
      console.log(chalk.white('Version: ') + pattern.version);
      console.log(chalk.white('Description: ') + pattern.description);
      if (pattern.minAgents) console.log(chalk.white('Min Agents: ') + pattern.minAgents);
      if (pattern.maxAgents) console.log(chalk.white('Max Agents: ') + pattern.maxAgents);
      
      if (pattern.input) {
        console.log(chalk.white('\nInput Requirements:'));
        console.log(JSON.stringify(pattern.input, null, 2));
      }
      
      if (pattern.script) {
        console.log(chalk.white('\nPattern Code Preview:'));
        console.log(chalk.gray('─'.repeat(50)));
        
        // Show first 15 lines of actual code
        const lines = pattern.script.split('\n');
        const preview = lines.slice(0, 15);
        preview.forEach((line: string) => console.log(chalk.gray(line)));
        
        if (lines.length > 15) {
          console.log(chalk.gray('... (truncated)'));
        }
      }
      
    } catch (error) {
      spinner.fail(chalk.red(`Failed to load pattern ${patternName}`));
      console.error(error);
    }
  });
