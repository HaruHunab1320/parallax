#!/usr/bin/env tsx
/**
 * RAG Quality Gate CLI - Validate RAG responses before returning to users
 *
 * Usage:
 *   pnpm check <example-file>
 *   pnpm check examples/good-response.json
 *   pnpm check examples/hallucinated-response.json
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:8080';

interface QualityCheckResult {
  status: 'approved' | 'needs_review' | 'rejected';
  approved: boolean;
  scores: {
    overall: number;
    groundedness: number;
    relevance: number;
    completeness: number;
  };
  checks: {
    total: number;
    passed: number;
    failed: number;
    groundedness: {
      passed: boolean;
      score: number;
      hallucinations: string[];
    };
    relevance: {
      passed: boolean;
      score: number;
      offTopicContent: string[];
    };
    completeness: {
      passed: boolean;
      score: number;
      missingParts: string[];
    };
  };
  summary: string;
  details: Array<{
    checkType: string;
    agent: string;
    passed: boolean;
    score: number;
    reasoning: string;
  }>;
  recommendation: string;
}

interface RAGResponse {
  question: string;
  answer: string;
  sources: string[];
}

async function submitCheck(ragResponse: RAGResponse): Promise<{ executionId: string }> {
  const response = await fetch(`${CONTROL_PLANE_URL}/api/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patternName: 'RAGQualityGate',
      input: {
        task: 'Validate RAG response quality',
        data: {
          question: ragResponse.question,
          answer: ragResponse.answer,
          generatedAnswer: ragResponse.answer,
          sources: ragResponse.sources,
          retrievedDocs: ragResponse.sources
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to submit check: ${error}`);
  }

  const execution = await response.json();
  return { executionId: execution.id };
}

async function pollForResult(executionId: string, maxWaitMs = 60000): Promise<QualityCheckResult> {
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`${CONTROL_PLANE_URL}/api/executions/${executionId}`);

    if (!response.ok) {
      throw new Error(`Failed to get execution status: ${response.statusText}`);
    }

    const execution = await response.json();

    if (execution.status === 'completed') {
      // Unwrap ConfidenceValue if present
      const result = execution.result?.value || execution.result;
      return result;
    } else if (execution.status === 'failed') {
      throw new Error(`Check failed: ${execution.error || 'Unknown error'}`);
    }

    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Check timed out');
}

function formatResults(result: QualityCheckResult, ragResponse: RAGResponse): void {
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('                    RAG QUALITY GATE RESULTS');
  console.log('═'.repeat(70));
  console.log();

  // Question preview
  console.log(`Question: "${ragResponse.question.substring(0, 60)}${ragResponse.question.length > 60 ? '...' : ''}"`);
  console.log();

  // Overall status
  const statusEmoji = result.status === 'approved' ? '✅' : result.status === 'needs_review' ? '⚠️' : '❌';
  console.log(`Status: ${statusEmoji} ${result.status.toUpperCase()}`);
  console.log(`Overall Score: ${Math.round((result.scores?.overall || 0) * 100)}%`);
  console.log(`Checks: ${result.checks?.passed || 0}/${result.checks?.total || 0} passed`);
  console.log();
  console.log(result.summary || 'No summary available');
  console.log();

  // Individual checks
  console.log('─'.repeat(70));
  console.log('  QUALITY CHECKS');
  console.log('─'.repeat(70));

  // Groundedness
  const gCheck = result.checks?.groundedness;
  if (gCheck) {
    const gEmoji = gCheck.passed ? '✅' : '❌';
    console.log(`\n  ${gEmoji} GROUNDEDNESS: ${Math.round((gCheck.score || 0) * 100)}%`);
    console.log('     Is the answer supported by the source documents?');
    if (gCheck.hallucinations && gCheck.hallucinations.length > 0) {
      console.log('     Hallucinations found:');
      for (const h of gCheck.hallucinations) {
        console.log(`       - ${h}`);
      }
    } else if (gCheck.passed) {
      console.log('     All claims are grounded in sources');
    }
  }

  // Relevance
  const rCheck = result.checks?.relevance;
  if (rCheck) {
    const rEmoji = rCheck.passed ? '✅' : '❌';
    console.log(`\n  ${rEmoji} RELEVANCE: ${Math.round((rCheck.score || 0) * 100)}%`);
    console.log('     Does the answer address the question?');
    if (rCheck.offTopicContent && rCheck.offTopicContent.length > 0) {
      console.log('     Off-topic content:');
      for (const o of rCheck.offTopicContent) {
        console.log(`       - ${o}`);
      }
    } else if (rCheck.passed) {
      console.log('     Answer is on-topic and relevant');
    }
  }

  // Completeness
  const cCheck = result.checks?.completeness;
  if (cCheck) {
    const cEmoji = cCheck.passed ? '✅' : '❌';
    console.log(`\n  ${cEmoji} COMPLETENESS: ${Math.round((cCheck.score || 0) * 100)}%`);
    console.log('     Are all parts of the question answered?');
    if (cCheck.missingParts && cCheck.missingParts.length > 0) {
      console.log('     Missing parts:');
      for (const m of cCheck.missingParts) {
        console.log(`       - ${m}`);
      }
    } else if (cCheck.passed) {
      console.log('     All parts of the question are addressed');
    }
  }

  // Recommendation
  console.log('\n' + '─'.repeat(70));
  console.log('  RECOMMENDATION');
  console.log('─'.repeat(70));
  console.log(`  ${result.recommendation || 'No recommendation available'}`);

  // Agent details
  if (result.details && result.details.length > 0) {
    console.log('\n' + '─'.repeat(70));
    console.log('  AGENT REASONING');
    console.log('─'.repeat(70));
    for (const detail of result.details) {
      const emoji = detail.passed ? '✅' : '❌';
      console.log(`\n  ${emoji} ${detail.agent} (${detail.checkType})`);
      if (detail.reasoning) {
        const shortReasoning = detail.reasoning.substring(0, 100);
        console.log(`     ${shortReasoning}${detail.reasoning.length > 100 ? '...' : ''}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(70));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: pnpm check <example-file>');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm check examples/good-response.json');
    console.log('  pnpm check examples/hallucinated-response.json');
    console.log('  pnpm check examples/incomplete-response.json');
    process.exit(1);
  }

  let ragResponse: RAGResponse;

  // Load from file
  const filePath = args[0];
  const fullPath = fs.existsSync(filePath) ? filePath : path.join(__dirname, filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  ragResponse = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

  console.log('\n🔍 Validating RAG response...');
  console.log(`\n   Question: "${ragResponse.question.substring(0, 70)}${ragResponse.question.length > 70 ? '...' : ''}"`);
  console.log(`   Answer length: ${ragResponse.answer.length} chars`);
  console.log(`   Sources: ${ragResponse.sources.length} documents`);

  try {
    const { executionId } = await submitCheck(ragResponse);
    console.log(`\n📋 Execution started: ${executionId}`);
    console.log('⏳ Running quality checks...\n');

    const result = await pollForResult(executionId);
    formatResults(result, ragResponse);
  } catch (error) {
    console.error('\n❌ Quality check failed:', error);
    process.exit(1);
  }
}

main();
