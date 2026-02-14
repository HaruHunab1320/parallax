/**
 * Org Chart Compiler Demo
 *
 * Demonstrates parsing YAML patterns and compiling to different targets.
 * Run with: npx tsx demo/demo.ts
 */

import { OrgChartCompiler } from '../src';

const patternYaml = `
name: code-review-team
description: A team pattern for code review workflows

structure:
  name: Engineering Team
  roles:
    engineer:
      name: Software Engineer
      capabilities:
        - coding
        - testing
        - debugging
      minInstances: 2
      maxInstances: 5

    reviewer:
      name: Code Reviewer
      capabilities:
        - code-review
        - mentoring
      reportsTo: lead

    lead:
      name: Tech Lead
      capabilities:
        - management
        - architecture
        - code-review
      singleton: true

workflow:
  name: code-review-workflow
  steps:
    - type: assign
      role: engineer
      task: "Implement the feature"

    - type: parallel
      steps:
        - type: assign
          role: engineer
          task: "Write unit tests"
        - type: assign
          role: engineer
          task: "Update documentation"

    - type: review
      reviewer: reviewer
      subject: implementation

    - type: condition
      check: "review.approved"
      then:
        type: approve
        approver: lead
        subject: final_review
      else:
        type: assign
        role: engineer
        task: "Address review feedback"

    - type: aggregate
      method: consensus
`;

async function main() {
  console.log('=== Org Chart Compiler Demo ===\n');

  // Parse the YAML pattern
  console.log('--- Parsing YAML Pattern ---\n');
  const pattern = OrgChartCompiler.parse(patternYaml);
  console.log(`Pattern name: ${pattern.name}`);
  console.log(`Roles: ${Object.keys(pattern.structure.roles).join(', ')}`);
  console.log(`Workflow steps: ${pattern.workflow.steps.length}`);

  // Validate the pattern
  console.log('\n--- Validating Pattern ---\n');
  const validation = OrgChartCompiler.validate(pattern);
  console.log(`Valid: ${validation.valid}`);
  if (validation.errors.length > 0) {
    console.log('Errors:', validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.log('Warnings:', validation.warnings);
  }

  // Compile to Prism DSL
  console.log('\n--- Compiled to Prism DSL ---\n');
  const prismResult = OrgChartCompiler.compile(pattern, { target: 'prism' });
  console.log(prismResult.output.substring(0, 800) + '...\n');

  // Compile to JSON execution plan
  console.log('\n--- Compiled to JSON Execution Plan ---\n');
  const jsonPlan = OrgChartCompiler.compileToJson(pattern);
  console.log(JSON.stringify(jsonPlan, null, 2).substring(0, 600) + '...\n');

  // Compile to Mermaid diagram
  console.log('\n--- Compiled to Mermaid Diagram ---\n');
  const mermaidResult = OrgChartCompiler.compile(pattern, { target: 'mermaid' });
  console.log(mermaidResult.output);

  // Show available targets
  console.log('\n--- Available Targets ---\n');
  console.log(OrgChartCompiler.getTargets().join(', '));

  // Show metadata
  console.log('\n--- Extracted Metadata ---\n');
  console.log(JSON.stringify(prismResult.metadata, null, 2));

  console.log('\n=== Demo Complete ===');
  console.log('Successfully parsed YAML and compiled to multiple targets.\n');
}

main().catch(console.error);
