#!/usr/bin/env tsx
/**
 * Document Analysis CLI - Multi-perspective document analysis
 *
 * Usage:
 *   pnpm analyze <document-file>
 *   pnpm analyze examples/meeting-notes.txt
 *   pnpm analyze examples/project-proposal.txt
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:8080';

interface AnalysisResult {
  document: {
    title: string;
    type: string;
    wordCount: number;
  };
  summary: {
    mainTopic: string;
    overview: string;
    conclusion: string;
  };
  keyPoints: {
    critical: Array<{ point: string; importance: string }>;
    supporting: string[];
    factsAndData: Array<{ fact: string; context: string }>;
    totalCount: number;
  };
  actionItems: {
    items: Array<{
      action: string;
      owner: string;
      deadline: string;
      priority: string;
    }>;
    decisions: Array<{ decision: string; stakeholders: string }>;
    followUps: string[];
    hasUrgentItems: boolean;
    totalCount: number;
  };
  sentiment: {
    overall: string;
    score: number;
    tone: { primary: string; secondary: string[] };
    emotionalIndicators: Array<{ emotion: string; intensity: string; context: string }>;
    concerns: string[];
    professionalism: { score: number; notes: string };
  };
  metadata: {
    analysesCompleted: number;
    averageConfidence: number;
    details: Array<{
      analysisType: string;
      agent: string;
      confidence: number;
      reasoning: string;
    }>;
  };
}

async function submitAnalysis(document: string, title: string): Promise<{ executionId: string }> {
  const response = await fetch(`${CONTROL_PLANE_URL}/api/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patternName: 'DocumentAnalysis',
      input: {
        task: 'Analyze document from multiple perspectives',
        data: {
          document: document,
          title: title,
          text: document
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to submit analysis: ${error}`);
  }

  const execution: any = await response.json();
  return { executionId: execution.id };
}

async function pollForResult(executionId: string, maxWaitMs = 90000): Promise<AnalysisResult> {
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`${CONTROL_PLANE_URL}/api/executions/${executionId}`);

    if (!response.ok) {
      throw new Error(`Failed to get execution status: ${response.statusText}`);
    }

    const execution: any = await response.json();

    if (execution.status === 'completed') {
      const result = execution.result?.value || execution.result;
      return result;
    } else if (execution.status === 'failed') {
      throw new Error(`Analysis failed: ${execution.error || 'Unknown error'}`);
    }

    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Analysis timed out');
}

function formatResults(result: AnalysisResult): void {
  console.log('\n');
  console.log('='.repeat(70));
  console.log('                    DOCUMENT ANALYSIS RESULTS');
  console.log('='.repeat(70));
  console.log();

  // Document info
  const doc = result.document || {};
  console.log(`Document: ${doc.title || 'Unknown'}`);
  console.log(`Type: ${doc.type || 'Unknown'} | Words: ~${doc.wordCount || 'N/A'}`);
  console.log(`Analyses: ${result.metadata?.analysesCompleted || 0}/4 completed`);
  console.log(`Confidence: ${Math.round((result.metadata?.averageConfidence || 0) * 100)}%`);
  console.log();

  // Summary
  console.log('-'.repeat(70));
  console.log('  EXECUTIVE SUMMARY');
  console.log('-'.repeat(70));
  const summary = result.summary || {};
  if (summary.mainTopic) {
    console.log(`\n  Topic: ${summary.mainTopic}`);
  }
  if (summary.overview) {
    console.log(`\n  Overview: ${summary.overview}`);
  }
  if (summary.conclusion) {
    console.log(`\n  Conclusion: ${summary.conclusion}`);
  }

  // Key Points
  console.log('\n' + '-'.repeat(70));
  console.log('  KEY POINTS');
  console.log('-'.repeat(70));
  const keyPoints = result.keyPoints || {};

  if (keyPoints.critical && keyPoints.critical.length > 0) {
    console.log('\n  Critical Points:');
    for (const point of keyPoints.critical.slice(0, 5)) {
      console.log(`    \u2022 ${point.point}`);
      if (point.importance) {
        console.log(`      Why: ${point.importance}`);
      }
    }
  }

  if (keyPoints.supporting && keyPoints.supporting.length > 0) {
    console.log('\n  Supporting Points:');
    for (const point of keyPoints.supporting.slice(0, 3)) {
      console.log(`    \u2022 ${point}`);
    }
  }

  if (keyPoints.factsAndData && keyPoints.factsAndData.length > 0) {
    console.log('\n  Facts & Data:');
    for (const fact of keyPoints.factsAndData.slice(0, 3)) {
      console.log(`    \u2022 ${fact.fact}`);
    }
  }

  // Action Items
  console.log('\n' + '-'.repeat(70));
  console.log('  ACTION ITEMS');
  console.log('-'.repeat(70));
  const actions = result.actionItems || {};

  if (actions.hasUrgentItems) {
    console.log('\n  \u26A0\uFE0F  URGENT ITEMS DETECTED');
  }

  if (actions.items && actions.items.length > 0) {
    console.log(`\n  Tasks (${actions.items.length} found):`);
    for (const item of actions.items.slice(0, 5)) {
      const priority = item.priority === 'high' ? '\u{1F534}' : item.priority === 'medium' ? '\u{1F7E1}' : '\u{1F7E2}';
      console.log(`    ${priority} ${item.action}`);
      console.log(`       Owner: ${item.owner} | Due: ${item.deadline}`);
    }
  } else {
    console.log('\n  No action items found');
  }

  if (actions.decisions && actions.decisions.length > 0) {
    console.log('\n  Decisions Needed:');
    for (const decision of actions.decisions.slice(0, 3)) {
      console.log(`    \u2753 ${decision.decision}`);
    }
  }

  if (actions.followUps && actions.followUps.length > 0) {
    console.log('\n  Follow-ups:');
    for (const followUp of actions.followUps.slice(0, 3)) {
      console.log(`    \u27A1\uFE0F  ${followUp}`);
    }
  }

  // Sentiment
  console.log('\n' + '-'.repeat(70));
  console.log('  SENTIMENT ANALYSIS');
  console.log('-'.repeat(70));
  const sentiment = result.sentiment || {};

  const sentimentEmoji = sentiment.overall === 'positive' ? '\u{1F60A}' :
                         sentiment.overall === 'negative' ? '\u{1F61F}' :
                         sentiment.overall === 'mixed' ? '\u{1F914}' : '\u{1F610}';

  console.log(`\n  Overall: ${sentimentEmoji} ${(sentiment.overall || 'Unknown').toUpperCase()}`);

  if (sentiment.score !== undefined) {
    const scoreBar = sentiment.score > 0 ? '+'.repeat(Math.round(sentiment.score * 5)) :
                     sentiment.score < 0 ? '-'.repeat(Math.round(Math.abs(sentiment.score) * 5)) : '=';
    console.log(`  Score: ${sentiment.score > 0 ? '+' : ''}${sentiment.score.toFixed(2)} [${scoreBar}]`);
  }

  if (sentiment.tone) {
    console.log(`\n  Tone: ${sentiment.tone.primary || 'Unknown'}`);
    if (sentiment.tone.secondary && sentiment.tone.secondary.length > 0) {
      console.log(`  Also: ${sentiment.tone.secondary.join(', ')}`);
    }
  }

  if (sentiment.professionalism) {
    console.log(`\n  Professionalism: ${Math.round((sentiment.professionalism.score || 0) * 100)}%`);
    if (sentiment.professionalism.notes) {
      console.log(`    ${sentiment.professionalism.notes}`);
    }
  }

  if (sentiment.concerns && sentiment.concerns.length > 0) {
    console.log('\n  \u26A0\uFE0F  Concerns:');
    for (const concern of sentiment.concerns) {
      console.log(`    - ${concern}`);
    }
  }

  // Agent details
  if (result.metadata?.details && result.metadata.details.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('  AGENT ANALYSIS DETAILS');
    console.log('-'.repeat(70));
    for (const detail of result.metadata.details) {
      console.log(`\n  \u2705 ${detail.agent} (${detail.analysisType})`);
      console.log(`     Confidence: ${Math.round(detail.confidence * 100)}%`);
      if (detail.reasoning) {
        const shortReasoning = detail.reasoning.substring(0, 80);
        console.log(`     ${shortReasoning}${detail.reasoning.length > 80 ? '...' : ''}`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: pnpm analyze <document-file>');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm analyze examples/meeting-notes.txt');
    console.log('  pnpm analyze examples/project-proposal.txt');
    console.log('  pnpm analyze examples/customer-email.txt');
    process.exit(1);
  }

  const filePath = args[0];
  const fullPath = fs.existsSync(filePath) ? filePath : path.join(__dirname, filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const document = fs.readFileSync(fullPath, 'utf-8');
  const title = path.basename(filePath, path.extname(filePath));

  console.log('\n\uD83D\uDCC4 Analyzing document...');
  console.log(`\n   File: ${filePath}`);
  console.log(`   Size: ${document.length} characters`);

  try {
    const { executionId } = await submitAnalysis(document, title);
    console.log(`\n\uD83D\uDCCB Execution started: ${executionId}`);
    console.log('\u23F3 Running 4 parallel analyses (summary, key points, actions, sentiment)...\n');

    const result = await pollForResult(executionId);
    formatResults(result);
  } catch (error) {
    console.error('\n\u274C Analysis failed:', error);
    process.exit(1);
  }
}

main();
