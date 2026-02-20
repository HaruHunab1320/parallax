#!/usr/bin/env tsx
/**
 * Prompt Testing CLI - A/B test different prompt styles
 *
 * Usage:
 *   pnpm test-prompts <example-file>
 *   pnpm test-prompts examples/explain-concept.json
 *   pnpm test-prompts examples/product-description.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:8080';

interface VariantResult {
  response: string;
  latencyMs: number;
  length: number;
}

interface Evaluation {
  variant: string;
  scores: {
    accuracy: number;
    clarity: number;
    engagement: number;
    appropriateness: number;
    overall: number;
  };
  strengths: string[];
  weaknesses: string[];
}

interface TestResult {
  query: string;
  variants: {
    concise: VariantResult;
    detailed: VariantResult;
    creative: VariantResult;
  };
  evaluation: {
    evaluations: Evaluation[];
    winner: string;
    winnerReason: string;
    recommendation: string;
  };
  metadata: {
    variantsTested: number;
    averageConfidence: number;
  };
}

async function submitVariantsTest(query: string): Promise<{ executionId: string }> {
  const response = await fetch(`${CONTROL_PLANE_URL}/api/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patternName: 'PromptTesting',
      input: {
        task: 'Test different prompt styles',
        data: {
          query: query,
          question: query
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to submit test: ${error}`);
  }

  const execution: any = await response.json();
  return { executionId: execution.id };
}

async function callJudgeDirectly(query: string, responses: any[]): Promise<any> {
  // Call Gemini directly to judge the responses (same logic as judge-agent)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Build comparison prompt (same as judge-agent)
  let responsesText = '';
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    responsesText += `\n--- RESPONSE ${i + 1} (${r.promptStyle || 'unknown'} style) ---\n${r.response}\n`;
  }

  const prompt = `You are an expert evaluator of AI responses. Compare the following responses to the same question and determine which is best.

ORIGINAL QUESTION:
"${query}"

RESPONSES TO EVALUATE:
${responsesText}

Evaluate each response on:
1. **Accuracy** (0-100): Is the information correct?
2. **Clarity** (0-100): Is it easy to understand?
3. **Engagement** (0-100): Is it interesting to read?
4. **Appropriateness** (0-100): Does the style match what a typical user would want?

You MUST respond in this exact JSON format:
{
  "evaluations": [
    {
      "variant": "<variant name: concise, detailed, or creative>",
      "scores": {
        "accuracy": <0-100>,
        "clarity": <0-100>,
        "engagement": <0-100>,
        "appropriateness": <0-100>,
        "overall": <0-100>
      },
      "strengths": ["<list of strengths>"],
      "weaknesses": ["<list of weaknesses>"]
    }
  ],
  "winner": "<best variant name: concise, detailed, or creative>",
  "winnerReason": "<why this variant won>",
  "recommendation": "<when to use each style>"
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse judge evaluation');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return { value: parsed };
}

async function pollForResult(executionId: string, maxWaitMs = 120000): Promise<TestResult> {
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
      throw new Error(`Test failed: ${execution.error || 'Unknown error'}`);
    }

    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Test timed out');
}

function formatResults(result: TestResult): void {
  console.log('\n');
  console.log('='.repeat(70));
  console.log('                    PROMPT A/B TEST RESULTS');
  console.log('='.repeat(70));
  console.log();

  // Query
  console.log(`Query: "${result.query}"`);
  console.log(`Variants tested: ${result.metadata?.variantsTested || 0}`);
  console.log();

  // Winner announcement
  const winner = result.evaluation?.winner || 'unknown';
  console.log('-'.repeat(70));
  console.log(`  \uD83C\uDFC6 WINNER: ${winner.toUpperCase()}`);
  console.log('-'.repeat(70));
  if (result.evaluation?.winnerReason) {
    console.log(`\n  ${result.evaluation.winnerReason}`);
  }
  console.log();

  // Comparison table
  console.log('-'.repeat(70));
  console.log('  VARIANT COMPARISON');
  console.log('-'.repeat(70));

  const variants = result.variants || {};
  const evals = result.evaluation?.evaluations || [];

  const styles = ['concise', 'detailed', 'creative'];
  for (const style of styles) {
    const variant = variants[style as keyof typeof variants];
    const evaluation = evals.find(e => e.variant === style);

    if (!variant) continue;

    const isWinner = style === winner;
    const prefix = isWinner ? '\uD83C\uDFC6' : '  ';

    console.log(`\n${prefix} ${style.toUpperCase()}`);
    console.log(`   Response length: ${variant.length || 0} chars`);
    console.log(`   Latency: ${variant.latencyMs || 0}ms`);

    if (evaluation?.scores) {
      console.log(`   Scores:`);
      console.log(`     Accuracy:       ${evaluation.scores.accuracy}%`);
      console.log(`     Clarity:        ${evaluation.scores.clarity}%`);
      console.log(`     Engagement:     ${evaluation.scores.engagement}%`);
      console.log(`     Appropriateness: ${evaluation.scores.appropriateness}%`);
      console.log(`     OVERALL:        ${evaluation.scores.overall}%`);
    }

    if (evaluation?.strengths && evaluation.strengths.length > 0) {
      console.log(`   Strengths:`);
      for (const s of evaluation.strengths.slice(0, 2)) {
        console.log(`     + ${s}`);
      }
    }

    if (evaluation?.weaknesses && evaluation.weaknesses.length > 0) {
      console.log(`   Weaknesses:`);
      for (const w of evaluation.weaknesses.slice(0, 2)) {
        console.log(`     - ${w}`);
      }
    }
  }

  // Full responses
  console.log('\n' + '-'.repeat(70));
  console.log('  FULL RESPONSES');
  console.log('-'.repeat(70));

  for (const style of styles) {
    const variant = variants[style as keyof typeof variants];
    if (!variant?.response) continue;

    const isWinner = style === winner;
    const prefix = isWinner ? '\uD83C\uDFC6' : '  ';

    console.log(`\n${prefix} ${style.toUpperCase()} RESPONSE:`);
    console.log('   ' + '-'.repeat(60));
    // Word wrap the response
    const words = variant.response.split(' ');
    let line = '   ';
    for (const word of words) {
      if (line.length + word.length > 68) {
        console.log(line);
        line = '   ' + word + ' ';
      } else {
        line += word + ' ';
      }
    }
    if (line.trim()) console.log(line);
    console.log('   ' + '-'.repeat(60));
  }

  // Recommendation
  if (result.evaluation?.recommendation) {
    console.log('\n' + '-'.repeat(70));
    console.log('  RECOMMENDATION');
    console.log('-'.repeat(70));
    console.log(`\n  ${result.evaluation.recommendation}`);
  }

  console.log('\n' + '='.repeat(70));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: pnpm test-prompts <example-file>');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm test-prompts examples/explain-concept.json');
    console.log('  pnpm test-prompts examples/product-description.json');
    console.log('  pnpm test-prompts examples/how-to-guide.json');
    process.exit(1);
  }

  const filePath = args[0];
  const fullPath = fs.existsSync(filePath) ? filePath : path.join(__dirname, filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  const query = data.query || data.question;

  console.log('\n\uD83E\uDDEA Testing prompt variants...');
  console.log(`\n   Query: "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}"`);

  try {
    // Phase 1: Run variant agents
    const { executionId } = await submitVariantsTest(query);
    console.log(`\n\uD83D\uDCCB Execution started: ${executionId}`);
    console.log('\u23F3 Phase 1: Running 3 variant agents...\n');

    const variantResult = await pollForResult(executionId);

    // Phase 2: Send responses to judge agent
    console.log('\n\u2696\uFE0F  Phase 2: Judge evaluating responses...');

    const responses = [];
    if (variantResult.variants?.concise?.response) {
      responses.push({
        promptStyle: 'concise',
        response: variantResult.variants.concise.response
      });
    }
    if (variantResult.variants?.detailed?.response) {
      responses.push({
        promptStyle: 'detailed',
        response: variantResult.variants.detailed.response
      });
    }
    if (variantResult.variants?.creative?.response) {
      responses.push({
        promptStyle: 'creative',
        response: variantResult.variants.creative.response
      });
    }

    if (responses.length > 0) {
      try {
        const judgeResult = await callJudgeDirectly(query, responses);

        // Merge judge evaluation into result
        if (judgeResult?.value) {
          variantResult.evaluation = {
            evaluations: judgeResult.value.evaluations || [],
            winner: judgeResult.value.winner || 'unknown',
            winnerReason: judgeResult.value.winnerReason || '',
            recommendation: judgeResult.value.recommendation || ''
          };
        }
        console.log(' Done!\n');
      } catch (judgeError) {
        console.log(` Judge unavailable: ${judgeError}`);
        console.log(' Showing variant results without evaluation.\n');
      }
    }

    formatResults(variantResult);
  } catch (error) {
    console.error('\n\u274C Test failed:', error);
    process.exit(1);
  }
}

main();
