/**
 * Compile Command - Convert YAML patterns to Prism
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { compileYamlToPrism, compileYamlFile, CompileOptions } from '../../yaml';

export const compileCommand = new Command('compile')
  .description('Compile YAML patterns to Prism DSL')
  .argument('<input>', 'YAML file or directory to compile')
  .option('-o, --output <path>', 'Output file or directory')
  .option('--no-comments', 'Omit explanatory comments from output')
  .option('--watch', 'Watch for changes and recompile')
  .option('--stdout', 'Print to stdout instead of file')
  .addHelpText('after', `
${chalk.gray('Examples:')}
  ${chalk.green('$')} parallax-generate compile patterns/document-analysis.yaml
  ${chalk.green('$')} parallax-generate compile patterns/ -o dist/
  ${chalk.green('$')} parallax-generate compile pattern.yaml --stdout
  ${chalk.green('$')} parallax-generate compile patterns/ --watch
  `)
  .action(async (input: string, options: {
    output?: string;
    comments?: boolean;
    watch?: boolean;
    stdout?: boolean;
  }) => {
    try {
      const inputPath = path.resolve(input);
      const stat = await fs.stat(inputPath);

      if (stat.isDirectory()) {
        await compileDirectory(inputPath, options);
      } else {
        await compileSingleFile(inputPath, options);
      }

      if (options.watch) {
        console.log(chalk.cyan('\nWatching for changes... (Ctrl+C to stop)'));
        watchForChanges(inputPath, options);
      }
    } catch (error: any) {
      console.error(chalk.red('Compilation failed:'), error.message);
      process.exit(1);
    }
  });

/**
 * Compile a single YAML file
 */
async function compileSingleFile(
  inputPath: string,
  options: { output?: string; comments?: boolean; stdout?: boolean }
) {
  const compileOptions: CompileOptions = {
    comments: options.comments !== false,
    validate: true,
  };

  console.log(chalk.cyan('Compiling:'), inputPath);

  const result = await compileYamlFile(inputPath, compileOptions);

  // Show warnings
  if (result.warnings.length > 0) {
    console.log(chalk.yellow('Warnings:'));
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`  - ${warning}`));
    }
  }

  if (options.stdout) {
    console.log('\n' + result.prism);
    return;
  }

  // Determine output path
  const outputPath = options.output || inputPath.replace(/\.ya?ml$/, '.prism');

  await fs.writeFile(outputPath, result.prism, 'utf-8');

  console.log(chalk.green('✓ Compiled to:'), outputPath);
  console.log(chalk.gray(`  Name: ${result.metadata.name}`));
  console.log(chalk.gray(`  Groups: ${result.metadata.groups.join(', ') || 'none'}`));
  console.log(chalk.gray(`  Confidence: ${result.metadata.confidenceMethod}`));
}

/**
 * Compile all YAML files in a directory
 */
async function compileDirectory(
  inputDir: string,
  options: { output?: string; comments?: boolean }
) {
  const files = await fs.readdir(inputDir);
  const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  if (yamlFiles.length === 0) {
    console.log(chalk.yellow('No YAML files found in:'), inputDir);
    return;
  }

  console.log(chalk.cyan(`Compiling ${yamlFiles.length} files from:`), inputDir);

  const outputDir = options.output || inputDir;
  await fs.mkdir(outputDir, { recursive: true });

  let successCount = 0;
  let errorCount = 0;

  for (const file of yamlFiles) {
    const inputPath = path.join(inputDir, file);
    const outputFile = file.replace(/\.ya?ml$/, '.prism');
    const outputPath = path.join(outputDir, outputFile);

    try {
      const result = await compileYamlFile(inputPath, {
        comments: options.comments !== false,
        validate: true,
      });

      await fs.writeFile(outputPath, result.prism, 'utf-8');
      console.log(chalk.green(`  ✓ ${file}`), chalk.gray(`→ ${outputFile}`));
      successCount++;

      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          console.log(chalk.yellow(`    ⚠ ${warning}`));
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`  ✗ ${file}`), chalk.gray(`- ${error.message}`));
      errorCount++;
    }
  }

  console.log('');
  console.log(chalk.green(`✓ ${successCount} compiled`), errorCount > 0 ? chalk.red(`✗ ${errorCount} failed`) : '');
}

/**
 * Watch for file changes and recompile
 */
function watchForChanges(
  inputPath: string,
  options: { output?: string; comments?: boolean }
) {
  const chokidar = require('chokidar');

  const watcher = chokidar.watch(inputPath, {
    ignored: /\.prism$/,
    persistent: true,
  });

  watcher.on('change', async (filePath: string) => {
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      console.log(chalk.cyan('\nFile changed:'), filePath);
      try {
        await compileSingleFile(filePath, options);
      } catch (error: any) {
        console.error(chalk.red('Compilation failed:'), error.message);
      }
    }
  });

  watcher.on('add', async (filePath: string) => {
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      console.log(chalk.cyan('\nNew file:'), filePath);
      try {
        await compileSingleFile(filePath, options);
      } catch (error: any) {
        console.error(chalk.red('Compilation failed:'), error.message);
      }
    }
  });
}
