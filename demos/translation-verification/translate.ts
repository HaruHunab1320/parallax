#!/usr/bin/env tsx
/**
 * Translation Verification CLI - Translate and verify quality
 *
 * Usage:
 *   pnpm translate <example-file>
 *   pnpm translate examples/simple.json
 *   pnpm translate examples/technical.json
 *   pnpm translate examples/marketing.json
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:8080';

interface TranslationResult {
  status: 'approved' | 'needs_review' | 'rejected';
  approved: boolean;
  translation: string;
  sourceLanguage: string;
  targetLanguage: string;
  scores: {
    overall: number;
    roundtripSimilarity: number;
    qualityScore: number;
    qualityBreakdown?: {
      fluency?: number;
      grammar?: number;
      style?: number;
      completeness?: number;
      culturalFit?: number;
    };
  };
  verification: {
    roundtrip: {
      passed: boolean;
      similarity: number;
      backTranslation: string;
      meaningPreserved: boolean;
      differences: string[];
      lostNuances: string[];
    };
    quality: {
      passed: boolean;
      score: number;
      issues: Array<{
        type: string;
        severity: string;
        description: string;
        suggestion?: string;
      }>;
      strengths: string[];
    };
  };
  checks: {
    total: number;
    passed: number;
    failed: number;
  };
  summary: string;
  details: Array<{
    checkType: string;
    agent: string;
    passed: boolean;
    confidence: number;
    reasoning: string;
  }>;
  translatorNotes: string;
  recommendation: string;
}

interface TranslationRequest {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
}

async function submitTranslation(request: TranslationRequest): Promise<{ executionId: string }> {
  const response = await fetch(`${CONTROL_PLANE_URL}/api/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patternName: 'TranslationVerification',
      input: {
        task: 'Translate and verify quality',
        data: {
          text: request.text,
          sourceLanguage: request.sourceLanguage || 'English',
          targetLanguage: request.targetLanguage
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to submit translation: ${error}`);
  }

  const execution = await response.json();
  return { executionId: execution.id };
}

async function pollForResult(executionId: string, maxWaitMs = 90000): Promise<TranslationResult> {
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
      throw new Error(`Translation failed: ${execution.error || 'Unknown error'}`);
    }

    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Translation timed out');
}

function formatResults(result: TranslationResult, request: TranslationRequest): void {
  console.log('\n');
  console.log('='.repeat(70));
  console.log('                    TRANSLATION RESULTS');
  console.log('='.repeat(70));
  console.log();

  // Original text preview
  const textPreview = request.text.substring(0, 60) + (request.text.length > 60 ? '...' : '');
  console.log(`Original: "${textPreview}"`);
  console.log(`Direction: ${result.sourceLanguage} -> ${result.targetLanguage}`);
  console.log();

  // Overall status
  const statusEmoji = result.status === 'approved' ? '\u2705' : result.status === 'needs_review' ? '\u26A0\uFE0F' : '\u274C';
  console.log(`Status: ${statusEmoji} ${result.status.toUpperCase()}`);
  console.log(`Overall Score: ${Math.round((result.scores?.overall || 0) * 100)}%`);
  console.log(`Checks: ${result.checks?.passed || 0}/${result.checks?.total || 0} passed`);
  console.log();
  console.log(result.summary || 'No summary available');
  console.log();

  // Translation output
  console.log('-'.repeat(70));
  console.log('  TRANSLATION');
  console.log('-'.repeat(70));
  console.log();
  if (result.translation) {
    console.log(`  ${result.translation}`);
  } else {
    console.log('  (No translation available)');
  }
  if (result.translatorNotes) {
    console.log();
    console.log(`  Notes: ${result.translatorNotes}`);
  }

  // Round-trip verification
  console.log('\n' + '-'.repeat(70));
  console.log('  ROUND-TRIP VERIFICATION');
  console.log('-'.repeat(70));

  const rtCheck = result.verification?.roundtrip;
  if (rtCheck) {
    const rtEmoji = rtCheck.passed ? '\u2705' : '\u274C';
    console.log(`\n  ${rtEmoji} SIMILARITY: ${Math.round((rtCheck.similarity || 0) * 100)}%`);
    console.log('     Does the translation preserve meaning when translated back?');

    if (rtCheck.backTranslation) {
      console.log(`\n     Back-translation: "${rtCheck.backTranslation.substring(0, 80)}${rtCheck.backTranslation.length > 80 ? '...' : ''}"`);
    }

    if (!rtCheck.meaningPreserved) {
      console.log('     \u26A0\uFE0F  Core meaning may not be fully preserved');
    }

    if (rtCheck.differences && rtCheck.differences.length > 0) {
      console.log('     Meaning differences:');
      for (const diff of rtCheck.differences.slice(0, 3)) {
        console.log(`       - ${diff}`);
      }
    }

    if (rtCheck.lostNuances && rtCheck.lostNuances.length > 0) {
      console.log('     Lost nuances:');
      for (const nuance of rtCheck.lostNuances.slice(0, 3)) {
        console.log(`       - ${nuance}`);
      }
    }

    if (rtCheck.passed && (!rtCheck.differences || rtCheck.differences.length === 0)) {
      console.log('     Meaning fully preserved through round-trip');
    }
  }

  // Quality check
  console.log('\n' + '-'.repeat(70));
  console.log('  QUALITY CHECK');
  console.log('-'.repeat(70));

  const qCheck = result.verification?.quality;
  if (qCheck) {
    const qEmoji = qCheck.passed ? '\u2705' : '\u274C';
    console.log(`\n  ${qEmoji} QUALITY SCORE: ${Math.round((qCheck.score || 0) * 100)}%`);
    console.log('     Is the translation fluent and natural?');

    // Quality breakdown
    const breakdown = result.scores?.qualityBreakdown;
    if (breakdown) {
      console.log('\n     Breakdown:');
      if (breakdown.fluency !== undefined) console.log(`       Fluency:     ${Math.round(breakdown.fluency * 100)}%`);
      if (breakdown.grammar !== undefined) console.log(`       Grammar:     ${Math.round(breakdown.grammar * 100)}%`);
      if (breakdown.style !== undefined) console.log(`       Style:       ${Math.round(breakdown.style * 100)}%`);
      if (breakdown.completeness !== undefined) console.log(`       Completeness: ${Math.round(breakdown.completeness * 100)}%`);
      if (breakdown.culturalFit !== undefined) console.log(`       Cultural Fit: ${Math.round(breakdown.culturalFit * 100)}%`);
    }

    if (qCheck.issues && qCheck.issues.length > 0) {
      console.log('\n     Issues found:');
      for (const issue of qCheck.issues.slice(0, 3)) {
        console.log(`       - [${issue.severity}] ${issue.type}: ${issue.description}`);
        if (issue.suggestion) {
          console.log(`         Suggestion: ${issue.suggestion}`);
        }
      }
    }

    if (qCheck.strengths && qCheck.strengths.length > 0) {
      console.log('\n     Strengths:');
      for (const strength of qCheck.strengths.slice(0, 3)) {
        console.log(`       + ${strength}`);
      }
    }

    if (qCheck.passed && (!qCheck.issues || qCheck.issues.length === 0)) {
      console.log('     Translation is fluent and natural');
    }
  }

  // Recommendation
  console.log('\n' + '-'.repeat(70));
  console.log('  RECOMMENDATION');
  console.log('-'.repeat(70));
  console.log(`  ${result.recommendation || 'No recommendation available'}`);

  // Agent details
  if (result.details && result.details.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('  AGENT REASONING');
    console.log('-'.repeat(70));
    for (const detail of result.details) {
      const emoji = detail.passed ? '\u2705' : '\u274C';
      console.log(`\n  ${emoji} ${detail.agent} (${detail.checkType})`);
      if (detail.reasoning) {
        const shortReasoning = detail.reasoning.substring(0, 100);
        console.log(`     ${shortReasoning}${detail.reasoning.length > 100 ? '...' : ''}`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: pnpm translate <example-file>');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm translate examples/simple.json');
    console.log('  pnpm translate examples/technical.json');
    console.log('  pnpm translate examples/marketing.json');
    console.log('  pnpm translate examples/idioms.json');
    process.exit(1);
  }

  let request: TranslationRequest;

  // Load from file
  const filePath = args[0];
  const fullPath = fs.existsSync(filePath) ? filePath : path.join(__dirname, filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  request = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

  console.log('\n\uD83C\uDF0D Translating and verifying...');
  console.log(`\n   Text: "${request.text.substring(0, 70)}${request.text.length > 70 ? '...' : ''}"`);
  console.log(`   From: ${request.sourceLanguage || 'English'}`);
  console.log(`   To: ${request.targetLanguage}`);

  try {
    const { executionId } = await submitTranslation(request);
    console.log(`\n\uD83D\uDCCB Execution started: ${executionId}`);
    console.log('\u23F3 Running translation and verification (this may take a moment)...\n');

    const result = await pollForResult(executionId);
    formatResults(result, request);
  } catch (error) {
    console.error('\n\u274C Translation failed:', error);
    process.exit(1);
  }
}

main();
