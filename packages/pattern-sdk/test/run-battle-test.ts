#!/usr/bin/env node

/**
 * Battle Test Runner Script
 * 
 * Orchestrates the battle testing process
 */

import { program } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';

program
  .name('battle-test')
  .description('Run Pattern SDK battle tests')
  .option('-m, --mini', 'Run mini test suite (5 tests)')
  .option('-f, --full', 'Run full test suite (all tests)')
  .option('-a, --analyze', 'Analyze existing results')
  .option('-c, --clean', 'Clean test results before running')
  .parse();

const options = program.opts();

async function main() {
  const resultsDir = path.join(__dirname, 'battle-test-results');
  
  // Clean if requested
  if (options.clean) {
    console.log('🧹 Cleaning previous results...');
    await fs.remove(resultsDir);
  }
  
  // Run tests or analyze
  if (options.analyze) {
    // Just analyze existing results
    console.log('📊 Analyzing existing results...\n');
    const { ResultAnalyzer } = await import('./analyze-results');
    const analyzer = new ResultAnalyzer();
    await analyzer.analyze();
  } else if (options.mini || options.full) {
    // Run tests
    if (options.mini) {
      console.log('🧪 Running mini battle test...\n');
      await import('./mini-battle-test');
    } else {
      console.log('🚀 Running full battle test suite...\n');
      console.log('⚠️  This will make many API calls and may take several minutes.\n');
      
      // Confirm before running full suite
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise<string>(resolve => {
        rl.question('Continue with full test? (y/N): ', resolve);
      });
      rl.close();
      
      if (answer.toLowerCase() === 'y') {
        const { BattleTestRunner } = await import('./battle-test-suite');
        const runner = new BattleTestRunner();
        await runner.runAllTests();
      } else {
        console.log('Test cancelled.');
        process.exit(0);
      }
    }
    
    // Auto-analyze after tests
    console.log('\n📊 Analyzing results...\n');
    const { ResultAnalyzer } = await import('./analyze-results');
    const analyzer = new ResultAnalyzer();
    await analyzer.analyze();
    
  } else {
    // Show help if no options
    program.help();
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});