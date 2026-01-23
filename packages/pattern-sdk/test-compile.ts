#!/usr/bin/env tsx
/**
 * Test the YAML to Prism compiler
 */

import { compileYamlToPrism } from './src/yaml';

const testYaml = `
name: DocumentAnalysis
version: 1.0.0
description: Multi-perspective document analysis with parallel specialized agents

input:
  document: string
  title: string

agents:
  capabilities: [document, analysis]
  min: 2

groups:
  summary:
    match: result.analysisType == "summary"
  keypoints:
    match: result.analysisType == "keypoints"
  actions:
    match: result.analysisType == "actions"
  sentiment:
    match: result.analysisType == "sentiment"

output:
  document:
    title: $summary.result.title
    type: $summary.result.documentType
    wordCount: $summary.result.wordCount
  summary:
    mainTopic: $summary.result.mainTopic
    overview: $summary.result.summary
    conclusion: $summary.result.conclusion
  keyPoints:
    critical: $keypoints.result.criticalPoints
    supporting: $keypoints.result.supportingPoints
  actionItems:
    items: $actions.result.actionItems
    hasUrgentItems: $actions.result.hasUrgentItems
  sentiment:
    overall: $sentiment.result.overallSentiment
    score: $sentiment.result.sentimentScore
  metadata:
    analysesCompleted: $totalCount
    averageConfidence: $avgConfidence
    patternVersion: "1.0.0"

confidence: average
`;

console.log('=== YAML Input ===');
console.log(testYaml);

console.log('\n=== Compiling... ===\n');

try {
  const result = compileYamlToPrism(testYaml);

  console.log('=== Generated Prism ===');
  console.log(result.prism);

  console.log('\n=== Metadata ===');
  console.log(JSON.stringify(result.metadata, null, 2));

  if (result.warnings.length > 0) {
    console.log('\n=== Warnings ===');
    result.warnings.forEach(w => console.log(`- ${w}`));
  }

  console.log('\n✅ Compilation successful!');
} catch (error) {
  console.error('❌ Compilation failed:', error);
}
