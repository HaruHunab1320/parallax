#!/usr/bin/env npx tsx
/**
 * Multi-Model Voting CLI
 *
 * Usage:
 *   ./vote.ts <question>                    Vote on a question (yes/no)
 *   ./vote.ts examples/content-moderation.json   Vote using a config file
 *   ./vote.ts --question "..." --options "a,b,c"
 *
 * Examples:
 *   ./vote.ts "Is this content appropriate for all ages?"
 *   ./vote.ts --question "What severity level?" --options "low,medium,high,critical"
 */

import * as fs from 'fs';

const CONTROL_PLANE_URL = process.env.PARALLAX_URL || 'http://localhost:8080';

interface VoteConfig {
  question: string;
  options: string[];
  context?: string;
}

interface VoteResult {
  decision: string | null;
  consensus: {
    type: string;
    confidence: number;
    isUnanimous: boolean;
    hasMajority: boolean;
    needsHumanReview: boolean;
  };
  summary: string;
  votes: {
    total: number;
    forWinner: number;
    breakdown: Array<{
      agent: string;
      model: string;
      decision: string;
      confidence: number;
      reasoning: string;
    }>;
  };
}

async function runVote(config: VoteConfig): Promise<VoteResult> {
  console.log('\n🗳️  Submitting question to voting agents...\n');
  console.log(`   Question: "${config.question}"`);
  console.log(`   Options: ${config.options.join(', ')}`);
  if (config.context) {
    console.log(`   Context: ${config.context.substring(0, 100)}${config.context.length > 100 ? '...' : ''}`);
  }
  console.log('');

  // Create execution via control plane API
  const response = await fetch(`${CONTROL_PLANE_URL}/api/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patternName: 'MultiModelVoting',
      input: {
        task: 'Vote on this question',
        data: config
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create execution: ${response.status} - ${error}`);
  }

  const execution = await response.json();
  const executionId = execution.id;

  console.log(`📋 Execution started: ${executionId}`);
  console.log('⏳ Waiting for models to vote...\n');

  // Poll for completion
  let result: any = null;
  const maxWait = 60000;
  const pollInterval = 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const statusResponse = await fetch(`${CONTROL_PLANE_URL}/api/executions/${executionId}`);
    if (!statusResponse.ok) {
      throw new Error(`Failed to get execution status: ${statusResponse.status}`);
    }

    const status = await statusResponse.json();

    if (status.status === 'completed') {
      result = status.result;
      break;
    } else if (status.status === 'failed') {
      throw new Error(`Execution failed: ${status.error}`);
    }

    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  if (!result) {
    throw new Error('Execution timed out');
  }

  console.log('\n');
  return result.value || result;
}

function printResult(result: VoteResult, config: VoteConfig) {
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
  };

  const consensusColors: Record<string, string> = {
    unanimous: colors.green,
    majority: colors.yellow,
    split: colors.red
  };

  const consensusEmoji: Record<string, string> = {
    unanimous: '✅',
    majority: '🤝',
    split: '⚠️'
  };

  console.log(`${colors.bright}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}                    VOTING RESULTS                          ${colors.reset}`);
  console.log(`${colors.bright}════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Question
  console.log(`${colors.cyan}Question:${colors.reset} ${config.question}\n`);

  // Decision
  const consensusColor = consensusColors[result.consensus?.type] || colors.reset;
  const emoji = consensusEmoji[result.consensus?.type] || '❓';

  if (result.decision) {
    console.log(`${colors.bright}Decision: ${colors.green}${result.decision.toUpperCase()}${colors.reset}`);
  } else {
    console.log(`${colors.bright}Decision: ${colors.red}NO CONSENSUS${colors.reset}`);
  }

  // Consensus info
  console.log(`${colors.cyan}Consensus:${colors.reset} ${emoji} ${consensusColor}${result.consensus?.type?.toUpperCase() || 'UNKNOWN'}${colors.reset}`);
  console.log(`${colors.cyan}Confidence:${colors.reset} ${((result.consensus?.confidence || 0) * 100).toFixed(0)}%`);
  console.log(`${colors.cyan}Votes:${colors.reset} ${result.votes?.forWinner || 0}/${result.votes?.total || 0} for winner\n`);

  // Summary
  console.log(`${colors.gray}${result.summary}${colors.reset}\n`);

  // Human review flag
  if (result.consensus?.needsHumanReview) {
    console.log(`${colors.yellow}⚠️  HUMAN REVIEW RECOMMENDED${colors.reset}\n`);
  }

  // Vote breakdown
  console.log(`${colors.bright}Individual Votes:${colors.reset}`);
  console.log(`${colors.gray}────────────────────────────────────────────────────────────${colors.reset}`);

  for (const vote of result.votes?.breakdown || []) {
    const voteColor = vote.decision === result.decision ? colors.green : colors.yellow;
    console.log(`\n  ${colors.blue}${vote.agent}${colors.reset} (${vote.model})`);
    console.log(`    Vote: ${voteColor}${vote.decision}${colors.reset}`);
    console.log(`    Confidence: ${(vote.confidence * 100).toFixed(0)}%`);
    console.log(`    ${colors.gray}${vote.reasoning?.substring(0, 100)}${vote.reasoning?.length > 100 ? '...' : ''}${colors.reset}`);
  }

  console.log(`\n${colors.bright}════════════════════════════════════════════════════════════${colors.reset}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  let config: VoteConfig;

  if (args.length === 0) {
    // Default sample question
    config = {
      question: 'Is the following content appropriate for a general audience?',
      options: ['yes', 'no'],
      context: 'The content is: "Learn how to bake delicious chocolate chip cookies with this easy recipe!"'
    };
    console.log('🗳️  Multi-Model Voting Demo');
    console.log('   Using sample question (no arguments provided)');
  } else if (args[0].endsWith('.json')) {
    // Load from config file
    const filePath = args[0];
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } else if (args.includes('--question')) {
    // Parse command line arguments
    const questionIdx = args.indexOf('--question');
    const optionsIdx = args.indexOf('--options');
    const contextIdx = args.indexOf('--context');

    const question = args[questionIdx + 1];
    const options = optionsIdx >= 0
      ? args[optionsIdx + 1].split(',').map(o => o.trim())
      : ['yes', 'no'];
    const context = contextIdx >= 0 ? args[contextIdx + 1] : undefined;

    config = { question, options, context };
  } else {
    // Simple question with yes/no options
    config = {
      question: args.join(' '),
      options: ['yes', 'no']
    };
  }

  try {
    const result = await runVote(config);
    printResult(result, config);
  } catch (error) {
    console.error(`\n❌ Vote failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
