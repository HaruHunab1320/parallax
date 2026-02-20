#!/usr/bin/env tsx
/**
 * Extract CLI - Extract structured data from documents using specialized agents
 *
 * Usage:
 *   pnpm extract <file-or-text>
 *   pnpm extract examples/invoice.txt
 *   pnpm extract "John Smith paid $500 on January 15, 2024"
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:8080';

interface ExtractionResult {
  extractions: {
    dates: Array<{
      original: string;
      normalized: string;
      type: string;
      confidence: number;
    }>;
    amounts: Array<{
      original: string;
      value: number;
      currency: string;
      type: string;
      confidence: number;
    }>;
    entities: {
      all: Array<{
        name: string;
        type: string;
        role: string | null;
        confidence: number;
      }>;
      people: string[];
      organizations: string[];
    };
    addresses: Array<{
      original: string;
      street: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      type: string;
      confidence: number;
    }>;
  };
  summary: {
    totalItems: number;
    breakdown: {
      dates: number;
      amounts: number;
      entities: number;
      addresses: number;
    };
    message: string;
  };
  confidence: number;
  agents: {
    total: number;
    details: Array<{
      agent: string;
      agentId: string;
      confidence: number;
      itemsExtracted: number;
      reasoning: string;
    }>;
  };
}

async function submitExtraction(text: string): Promise<{ executionId: string }> {
  const response = await fetch(`${CONTROL_PLANE_URL}/api/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patternName: 'DocumentExtraction',
      input: {
        task: 'Extract structured data from document',
        data: { text, document: text }
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to submit extraction: ${error}`);
  }

  const execution: any = await response.json();
  return { executionId: execution.id };
}

async function pollForResult(executionId: string, maxWaitMs = 60000): Promise<ExtractionResult> {
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`${CONTROL_PLANE_URL}/api/executions/${executionId}`);

    if (!response.ok) {
      throw new Error(`Failed to get execution status: ${response.statusText}`);
    }

    const execution: any = await response.json();

    if (execution.status === 'completed') {
      // Debug: log the actual result structure
      if (process.env.DEBUG) {
        console.log('\n\nDEBUG - execution.result:', JSON.stringify(execution.result, null, 2).substring(0, 500));
      }
      // Unwrap ConfidenceValue if present (result may be wrapped in {value, confidence})
      const result = execution.result?.value || execution.result;
      return result;
    } else if (execution.status === 'failed') {
      throw new Error(`Extraction failed: ${execution.error || 'Unknown error'}`);
    }

    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Extraction timed out');
}

function formatResults(result: ExtractionResult, documentPreview: string): void {
  // Debug: show what we received
  if (process.env.DEBUG) {
    console.log('\n\nDEBUG - Full result object:');
    console.log(JSON.stringify(result, null, 2).substring(0, 2000));
    console.log('\n');
  }

  console.log('\n');
  console.log('═'.repeat(70));
  console.log('                    EXTRACTION RESULTS');
  console.log('═'.repeat(70));
  console.log();

  // Document preview
  console.log(`Document: "${documentPreview.substring(0, 60)}${documentPreview.length > 60 ? '...' : ''}"`);
  console.log();

  // Summary
  const confidence = Math.round((result.confidence || 0) * 100);
  console.log(`Total Extractions: ${result.summary?.totalItems || 0}`);
  console.log(`Overall Confidence: ${confidence}%`);
  console.log();
  console.log(result.summary?.message || 'No summary available');
  console.log();

  // Dates
  const dates = result.extractions?.dates || [];
  if (dates.length > 0) {
    console.log('─'.repeat(70));
    console.log(`  DATES (${dates.length} found)`);
    console.log('─'.repeat(70));
    for (const date of dates) {
      console.log(`    "${date.original}" → ${date.normalized}`);
      console.log(`      Type: ${date.type}, Confidence: ${Math.round((date.confidence || 0) * 100)}%`);
    }
    console.log();
  }

  // Amounts
  const amounts = result.extractions?.amounts || [];
  if (amounts.length > 0) {
    console.log('─'.repeat(70));
    console.log(`  AMOUNTS (${amounts.length} found)`);
    console.log('─'.repeat(70));
    for (const amount of amounts) {
      console.log(`    "${amount.original}" → ${amount.currency} ${amount.value.toLocaleString()}`);
      console.log(`      Type: ${amount.type}, Confidence: ${Math.round((amount.confidence || 0) * 100)}%`);
    }
    console.log();
  }

  // Entities
  const entities = result.extractions?.entities?.all || [];
  if (entities.length > 0) {
    console.log('─'.repeat(70));
    console.log(`  ENTITIES (${entities.length} found)`);
    console.log('─'.repeat(70));
    const people = result.extractions?.entities?.people || [];
    const orgs = result.extractions?.entities?.organizations || [];
    if (people.length > 0) {
      console.log(`    People: ${people.join(', ')}`);
    }
    if (orgs.length > 0) {
      console.log(`    Organizations: ${orgs.join(', ')}`);
    }
    console.log();
    for (const entity of entities) {
      console.log(`    "${entity.name}" (${entity.type})`);
      if (entity.role) {
        console.log(`      Role: ${entity.role}, Confidence: ${Math.round((entity.confidence || 0) * 100)}%`);
      } else {
        console.log(`      Confidence: ${Math.round((entity.confidence || 0) * 100)}%`);
      }
    }
    console.log();
  }

  // Addresses
  const addresses = result.extractions?.addresses || [];
  if (addresses.length > 0) {
    console.log('─'.repeat(70));
    console.log(`  ADDRESSES (${addresses.length} found)`);
    console.log('─'.repeat(70));
    for (const addr of addresses) {
      console.log(`    ${addr.street}`);
      console.log(`    ${addr.city}, ${addr.state} ${addr.postalCode}`);
      console.log(`    ${addr.country}`);
      console.log(`      Type: ${addr.type}, Confidence: ${Math.round((addr.confidence || 0) * 100)}%`);
      console.log();
    }
  }

  // Agent details
  if (result.agents?.details && result.agents.details.length > 0) {
    console.log('─'.repeat(70));
    console.log('  AGENT CONTRIBUTIONS');
    console.log('─'.repeat(70));
    for (const agent of result.agents.details) {
      console.log(`    ${agent.agent}`);
      console.log(`      Items: ${agent.itemsExtracted}, Confidence: ${Math.round((agent.confidence || 0) * 100)}%`);
      if (agent.reasoning) {
        const shortReasoning = agent.reasoning.substring(0, 60);
        console.log(`      ${shortReasoning}${agent.reasoning.length > 60 ? '...' : ''}`);
      }
    }
    console.log();
  }

  console.log('═'.repeat(70));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: pnpm extract <file-or-text>');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm extract examples/invoice.txt');
    console.log('  pnpm extract "John Smith paid $500 on January 15, 2024"');
    process.exit(1);
  }

  let text = args.join(' ');

  // Check if it's a file path
  const potentialPath = args[0];
  if (fs.existsSync(potentialPath)) {
    text = fs.readFileSync(potentialPath, 'utf-8');
    console.log(`\n📄 Extracting from file: ${potentialPath}`);
  } else if (potentialPath.endsWith('.txt') || potentialPath.endsWith('.json')) {
    // Try relative to examples directory
    const examplesPath = path.join(__dirname, potentialPath);
    if (fs.existsSync(examplesPath)) {
      text = fs.readFileSync(examplesPath, 'utf-8');
      console.log(`\n📄 Extracting from file: ${examplesPath}`);
    }
  }

  console.log('\n🔍 Submitting document to extraction agents...');
  console.log(`\n   Document preview: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);

  try {
    const { executionId } = await submitExtraction(text);
    console.log(`\n📋 Execution started: ${executionId}`);
    console.log('⏳ Waiting for agents to extract data...\n');

    const result = await pollForResult(executionId);
    formatResults(result, text);
  } catch (error) {
    console.error('\n❌ Extraction failed:', error);
    process.exit(1);
  }
}

main();
