#!/usr/bin/env npx tsx
/**
 * PR Review Bot - Review Trigger Script
 *
 * Usage:
 *   ./review.ts <file>           Review a file
 *   ./review.ts --stdin          Review code from stdin
 *   ./review.ts                  Review the sample code
 *
 * Examples:
 *   ./review.ts examples/sample-code.ts
 *   cat myfile.ts | ./review.ts --stdin
 *   echo "const x = eval(input)" | ./review.ts --stdin
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTROL_PLANE_URL = process.env.PARALLAX_URL || 'http://localhost:8080';

interface Finding {
  agent?: string;
  severity: string;
  issue: string;
  suggestion: string;
  line_hint?: string;
  confidence?: number;
}

interface AgentResult {
  agent: string;
  agentId?: string;
  confidence: number;
  summary: string;
  findingCount: number;
  findings?: Finding[];
}

interface ReviewResult {
  summary: string;
  recommendation: string;
  overallSeverity: string;
  consensus: {
    level: string;
    confidence: number;
    agentCount: number;
  };
  findings?: Finding[];
  agentResults: AgentResult[];
}

async function runReview(code: string): Promise<ReviewResult> {
  console.log('\n🔍 Submitting code for review...\n');

  // Create execution via control plane API
  const response = await fetch(`${CONTROL_PLANE_URL}/api/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patternName: 'CodeReviewOrchestrator',
      input: {
        task: 'Review this code for security, style, documentation, and testability issues',
        data: { code }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create execution: ${response.status} - ${error}`);
  }

  const execution: any = await response.json();
  const executionId = execution.id;

  console.log(`📋 Execution started: ${executionId}`);
  console.log('⏳ Waiting for agents to analyze...\n');

  // Poll for completion
  let result: any = null;
  const maxWait = 60000; // 60 seconds
  const pollInterval = 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const statusResponse = await fetch(`${CONTROL_PLANE_URL}/api/executions/${executionId}`);
    if (!statusResponse.ok) {
      throw new Error(`Failed to get execution status: ${statusResponse.status}`);
    }

    const status: any = await statusResponse.json();

    if (status.status === 'completed') {
      result = status.result;
      break;
    } else if (status.status === 'failed') {
      throw new Error(`Execution failed: ${status.error}`);
    }

    // Show progress
    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  if (!result) {
    throw new Error('Execution timed out');
  }

  console.log('\n');
  return result.value || result;
}

function printReview(review: ReviewResult) {
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

  const severityColors: Record<string, string> = {
    critical: colors.red,
    high: colors.red,
    medium: colors.yellow,
    low: colors.gray,
    none: colors.green
  };

  const recommendationEmoji: Record<string, string> = {
    block: '🚫',
    request_changes: '⚠️',
    discuss: '💬',
    approve_with_comments: '💭',
    approve: '✅'
  };

  console.log(`${colors.bright}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}                    CODE REVIEW RESULTS                      ${colors.reset}`);
  console.log(`${colors.bright}════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Summary
  console.log(`${colors.cyan}Summary:${colors.reset} ${review.summary}\n`);

  // Recommendation
  const recEmoji = recommendationEmoji[review.recommendation] || '❓';
  const recColor = review.recommendation === 'approve' ? colors.green :
                   review.recommendation === 'block' ? colors.red : colors.yellow;
  console.log(`${colors.cyan}Recommendation:${colors.reset} ${recEmoji} ${recColor}${review.recommendation.toUpperCase()}${colors.reset}`);
  console.log(`${colors.cyan}Overall Severity:${colors.reset} ${severityColors[review.overallSeverity] || ''}${review.overallSeverity}${colors.reset}`);
  console.log(`${colors.cyan}Consensus:${colors.reset} ${review.consensus.level} (confidence: ${(review.consensus.confidence * 100).toFixed(0)}%)`);
  console.log(`${colors.cyan}Agents:${colors.reset} ${review.consensus.agentCount} participated\n`);

  // Agent breakdown
  console.log(`${colors.bright}Agent Results:${colors.reset}`);
  console.log(`${colors.gray}────────────────────────────────────────────────────────────${colors.reset}`);
  for (const agent of review.agentResults || []) {
    const confColor = agent.confidence > 0.8 ? colors.green : agent.confidence > 0.6 ? colors.yellow : colors.red;
    const findingCount = agent.findingCount ?? agent.findings?.length ?? 0;
    console.log(`  ${colors.blue}${agent.agent}${colors.reset}`);
    console.log(`    Confidence: ${confColor}${(agent.confidence * 100).toFixed(0)}%${colors.reset}`);
    console.log(`    Findings: ${findingCount}`);
    console.log(`    ${colors.gray}${agent.summary}${colors.reset}\n`);
  }

  // Flatten findings from agent results if not already flat
  let allFindings: Finding[] = review.findings || [];
  if (allFindings.length === 0 && review.agentResults) {
    for (const agent of review.agentResults) {
      if (agent.findings && agent.findings.length > 0) {
        for (const f of agent.findings) {
          allFindings.push({
            ...f,
            agent: agent.agent,
            confidence: f.confidence ?? agent.confidence
          });
        }
      }
    }
  }

  // Findings
  if (allFindings.length > 0) {
    console.log(`${colors.bright}Findings (${allFindings.length}):${colors.reset}`);
    console.log(`${colors.gray}────────────────────────────────────────────────────────────${colors.reset}`);

    for (const finding of allFindings) {
      const sevColor = severityColors[finding.severity] || colors.reset;
      console.log(`\n  ${sevColor}[${finding.severity.toUpperCase()}]${colors.reset} ${finding.issue}`);
      console.log(`    ${colors.gray}Agent: ${finding.agent}${colors.reset}`);
      if (finding.line_hint) {
        console.log(`    ${colors.gray}Location: ${finding.line_hint}${colors.reset}`);
      }
      console.log(`    ${colors.green}Suggestion: ${finding.suggestion}${colors.reset}`);
      if (finding.confidence) {
        console.log(`    ${colors.gray}Confidence: ${(finding.confidence * 100).toFixed(0)}%${colors.reset}`);
      }
    }
  } else {
    console.log(`${colors.green}No significant findings!${colors.reset}`);
  }

  console.log(`\n${colors.bright}════════════════════════════════════════════════════════════${colors.reset}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  let code: string;

  if (args.includes('--stdin')) {
    // Read from stdin
    code = fs.readFileSync(0, 'utf-8');
  } else if (args.length > 0 && !args[0].startsWith('-')) {
    // Read from file
    const filePath = args[0];
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    code = fs.readFileSync(filePath, 'utf-8');
    console.log(`📄 Reviewing: ${filePath}`);
  } else {
    // Use sample code
    const samplePath = path.join(__dirname, 'examples', 'sample-code.ts');
    if (!fs.existsSync(samplePath)) {
      console.error('Error: No file specified and sample code not found');
      console.error('Usage: ./review.ts <file>');
      process.exit(1);
    }
    code = fs.readFileSync(samplePath, 'utf-8');
    console.log('📄 Reviewing: examples/sample-code.ts (sample with intentional issues)');
  }

  try {
    const review = await runReview(code);
    printReview(review);
  } catch (error) {
    console.error(`\n❌ Review failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
