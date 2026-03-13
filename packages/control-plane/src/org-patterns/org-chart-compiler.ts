/**
 * Org-Chart to Prism Compiler
 *
 * Translates declarative org-chart YAML patterns into executable Prism scripts.
 * This ensures a single execution engine (Prism/RuntimeManager) while allowing
 * multiple input formats.
 */

import { OrgPattern, OrgRole, WorkflowStep, OrgStructure } from './types';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CompilerOptions {
  /** Include comments in generated Prism */
  includeComments?: boolean;
  /** Pretty print the output */
  prettyPrint?: boolean;
}

export interface CompiledPattern {
  /** Original pattern name */
  name: string;
  /** Generated Prism script */
  script: string;
  /** Pattern metadata for the Prism header */
  metadata: {
    name: string;
    version: string;
    description: string;
    input: Record<string, any>;
    agents: { capabilities: string[]; minAgents?: number; maxAgents?: number };
    threads?: Record<string, any>;
    workspace?: Record<string, any>;
    metadata?: Record<string, any>;
  };
}

/**
 * Compile an org-chart pattern (YAML) to Prism script
 */
export function compileOrgPattern(
  pattern: OrgPattern,
  options: CompilerOptions = {}
): CompiledPattern {
  const { includeComments = true, prettyPrint = true } = options;

  const lines: string[] = [];

  // Generate header comment
  if (includeComments) {
    lines.push(`// Auto-generated from org-chart pattern: ${pattern.name}`);
    lines.push(`// Generated at: ${new Date().toISOString()}`);
    lines.push('');
  }

  // Extract role capabilities for agent selection
  const allCapabilities = extractCapabilities(pattern.structure);
  const agentCounts = calculateAgentCounts(pattern.structure);
  const threadMetadata = extractThreadMetadata(pattern.structure);

  // Generate role assignments section
  if (includeComments) {
    lines.push('// === Team Structure ===');
  }
  lines.push(`let roles = ${JSON.stringify(Object.keys(pattern.structure.roles), null, 2)};`);
  lines.push(`let roleExecution = ${JSON.stringify(buildRoleExecutionMetadata(pattern.structure), null, 2)};`);
  lines.push('');

  // Map agents to roles based on their index
  lines.push('// Map agents to roles');
  lines.push('let roleAssignments = {};');
  let agentIndex = 0;
  for (const [roleId, role] of Object.entries(pattern.structure.roles)) {
    const count = role.singleton ? 1 : (role.minInstances || 1);
    lines.push(`roleAssignments["${roleId}"] = agentResults.slice(${agentIndex}, ${agentIndex + count});`);
    agentIndex += count;
  }
  lines.push('');

  // Generate workflow execution
  if (includeComments) {
    lines.push('// === Workflow Execution ===');
  }

  // Generate step variables
  const stepCode = compileWorkflowSteps(pattern.workflow.steps, pattern.structure, includeComments);
  lines.push(...stepCode);

  // Generate output
  lines.push('');
  if (includeComments) {
    lines.push('// === Final Output ===');
  }

  const outputVar = pattern.workflow.output || 'step_' + (pattern.workflow.steps.length - 1) + '_result';
  lines.push(`let finalResult = {`);
  lines.push(`  patternName: "${pattern.name}",`);
  lines.push(`  workflow: "${pattern.workflow.name}",`);
  lines.push(`  result: ${outputVar},`);
  lines.push(`  roles: roles,`);
  lines.push(`  agentsUsed: agentResults.length,`);
  lines.push(`  confidence: calculateConfidence(agentResults)`);
  lines.push(`};`);
  lines.push('');
  lines.push('finalResult');

  // Add helper functions
  lines.push('');
  if (includeComments) {
    lines.push('// === Helper Functions ===');
  }
  lines.push(...generateHelperFunctions());

  const script = prettyPrint ? lines.join('\n') : lines.join(' ');

  return {
    name: pattern.name,
    script,
    metadata: {
      name: pattern.name,
      version: pattern.version || '1.0.0',
      description: pattern.description || `Compiled from org-chart: ${pattern.name}`,
      input: pattern.workflow.input || {},
      agents: {
        capabilities: allCapabilities,
        minAgents: agentCounts.min,
        maxAgents: agentCounts.max,
      },
      threads: threadMetadata.enabled ? threadMetadata : undefined,
      workspace: pattern.metadata?.workspace,
      metadata: {
        ...(pattern.metadata || {}),
        roleExecution: buildRoleExecutionMetadata(pattern.structure),
      },
    },
  };
}

/**
 * Compile workflow steps to Prism code
 */
function compileWorkflowSteps(
  steps: WorkflowStep[],
  structure: OrgStructure,
  includeComments: boolean
): string[] {
  const lines: string[] = [];

  steps.forEach((step, index) => {
    const varName = `step_${index}_result`;

    if (includeComments) {
      lines.push(`// Step ${index}: ${step.type}`);
    }

    switch (step.type) {
      case 'assign':
        lines.push(...compileAssignStep(step, varName, structure));
        break;

      case 'parallel':
        lines.push(...compileParallelStep(step, varName, index, structure, includeComments));
        break;

      case 'sequential':
        lines.push(...compileSequentialStep(step, varName, index, structure, includeComments));
        break;

      case 'review':
        lines.push(...compileReviewStep(step, varName, structure));
        break;

      case 'approve':
        lines.push(...compileApproveStep(step, varName, structure));
        break;

      case 'aggregate':
        lines.push(...compileAggregateStep(step, varName, index));
        break;

      case 'condition':
        lines.push(...compileConditionStep(step, varName, index, structure, includeComments));
        break;

      case 'select':
        lines.push(...compileSelectStep(step, varName, structure));
        break;

      default:
        lines.push(`let ${varName} = null; // Unknown step type`);
    }

    lines.push('');
  });

  return lines;
}

function compileAssignStep(
  step: Extract<WorkflowStep, { type: 'assign' }>,
  varName: string,
  structure: OrgStructure
): string[] {
  const role = structure.roles[step.role];
  const roleName = role?.name || step.role;
  const threadEnabled = !!role?.threadConfig?.enabled;

  return [
    `// Assign task to ${roleName}`,
    `let ${varName} = (function() {`,
    `  let roleAgents = roleAssignments["${step.role}"] || [];`,
    `  if (roleAgents.length === 0) {`,
    `    return { error: "No agents for role: ${step.role}", confidence: 0 };`,
    `  }`,
    threadEnabled
      ? `  // Explicit thread-backed orchestration for this role`
      : `  // Get result from first available agent in this role`,
    `  let agent = roleAgents[0];`,
    ...(threadEnabled
      ? [
          `  let threadOps = {`,
          `    spawn: spawnRoleThread("${step.role}", ${JSON.stringify(step.task)}),`,
          `    input: sendRoleThreadInput("${step.role}", agent, ${JSON.stringify(step.task)}, ${JSON.stringify(step.input || null)}),`,
          `    await: awaitRoleThread("${step.role}", agent, "thread_turn_complete")`,
          `  };`,
        ]
      : []),
    `  return {`,
    `    role: "${step.role}",`,
    `    task: ${JSON.stringify(step.task)},`,
    ...(threadEnabled
      ? [
          `    mode: "thread",`,
          `    thread: threadOps,`,
          `    result: threadOps.await,`,
          `    confidence: 0.8,`,
          `    agentId: agent?.agentId,`,
          `    threadId: agent?.threadId`,
        ]
      : [
          `    result: agent?.result,`,
          `    confidence: agent?.confidence || 0.7,`,
          `    agentId: agent?.agentId`,
        ]),
    `  };`,
    `})();`,
  ];
}

function compileParallelStep(
  step: Extract<WorkflowStep, { type: 'parallel' }>,
  varName: string,
  stepIndex: number,
  structure: OrgStructure,
  includeComments: boolean
): string[] {
  const lines: string[] = [
    `let ${varName} = [];`,
  ];

  step.steps.forEach((subStep, subIndex) => {
    const subVarName = `step_${stepIndex}_sub_${subIndex}`;
    const subCode = compileWorkflowSteps([subStep], structure, includeComments);
    // Rename the variable in the generated code
    const renamedCode = subCode.map(line =>
      line.replace(/step_0_result/g, subVarName)
    );
    lines.push(...renamedCode);
    lines.push(`${varName}.push(${subVarName});`);
  });

  return lines;
}

function compileSequentialStep(
  step: Extract<WorkflowStep, { type: 'sequential' }>,
  varName: string,
  stepIndex: number,
  structure: OrgStructure,
  includeComments: boolean
): string[] {
  const lines: string[] = [
    `let ${varName} = [];`,
  ];

  step.steps.forEach((subStep, subIndex) => {
    const subVarName = `step_${stepIndex}_seq_${subIndex}`;
    const subCode = compileWorkflowSteps([subStep], structure, includeComments);
    const renamedCode = subCode.map(line =>
      line.replace(/step_0_result/g, subVarName)
    );
    lines.push(...renamedCode);
    lines.push(`${varName}.push(${subVarName});`);
  });

  return lines;
}

function compileReviewStep(
  step: Extract<WorkflowStep, { type: 'review' }>,
  varName: string,
  structure: OrgStructure
): string[] {
  const role = structure.roles[step.reviewer];
  const roleName = role?.name || step.reviewer;
  const threadEnabled = !!role?.threadConfig?.enabled;

  return [
    `// Review by ${roleName}`,
    `let ${varName} = (function() {`,
    `  let reviewerAgents = roleAssignments["${step.reviewer}"] || [];`,
    `  if (reviewerAgents.length === 0) {`,
    `    return { approved: true, confidence: 0.5, reason: "No reviewer available" };`,
    `  }`,
    `  let reviewer = reviewerAgents[0];`,
    threadEnabled
      ? `  let reviewThread = sendRoleThreadInput("${step.reviewer}", reviewer, "review", ${JSON.stringify(step.subject)});`
      : `  // Simulate review based on agent confidence`,
    `  let approved = (reviewer?.confidence || 0) > 0.6;`,
    `  return {`,
    `    reviewer: "${step.reviewer}",`,
    `    approved: approved,`,
    `    confidence: reviewer?.confidence || 0.7,`,
    ...(threadEnabled ? [`    thread: reviewThread,`] : []),
    `    feedback: approved ? "Looks good" : "Needs revision"`,
    `  };`,
    `})();`,
  ];
}

function compileApproveStep(
  step: Extract<WorkflowStep, { type: 'approve' }>,
  varName: string,
  structure: OrgStructure
): string[] {
  const role = structure.roles[step.approver];
  const threadEnabled = !!role?.threadConfig?.enabled;
  return [
    `// Approval by ${step.approver}`,
    `let ${varName} = (function() {`,
    `  let approverAgents = roleAssignments["${step.approver}"] || [];`,
    `  if (approverAgents.length === 0) {`,
    `    return { approved: false, reason: "No approver available" };`,
    `  }`,
    `  let approver = approverAgents[0];`,
    ...(threadEnabled
      ? [`  let approvalThread = sendRoleThreadInput("${step.approver}", approver, "approve", ${JSON.stringify(step.subject)});`]
      : []),
    `  let approved = (approver?.confidence || 0) > 0.7;`,
    `  return {`,
    `    approver: "${step.approver}",`,
    `    approved: approved,`,
    `    confidence: approver?.confidence || 0.7,`,
    ...(threadEnabled ? [`    thread: approvalThread`] : [`    agentId: approver?.agentId`]),
    `  };`,
    `})();`,
  ];
}

function compileAggregateStep(
  step: Extract<WorkflowStep, { type: 'aggregate' }>,
  varName: string,
  stepIndex: number
): string[] {
  const prevVar = `step_${stepIndex - 1}_result`;

  return [
    `// Aggregate results using: ${step.method}`,
    `let ${varName} = aggregate${capitalize(step.method)}(${prevVar});`,
  ];
}

function compileConditionStep(
  step: Extract<WorkflowStep, { type: 'condition' }>,
  varName: string,
  stepIndex: number,
  structure: OrgStructure,
  includeComments: boolean
): string[] {
  const lines: string[] = [];

  // Compile the condition check
  const checkExpr = step.check.startsWith('$')
    ? step.check.replace(/\$\{?(\w+)\}?/g, '$1')
    : step.check;

  lines.push(`let ${varName};`);
  lines.push(`if (${checkExpr}) {`);

  // Compile then branch
  const thenCode = compileWorkflowSteps([step.then], structure, includeComments);
  const thenVarName = `step_${stepIndex}_then`;
  const renamedThenCode = thenCode.map(line =>
    line.replace(/step_0_result/g, thenVarName)
  );
  lines.push(...renamedThenCode.map(l => '  ' + l));
  lines.push(`  ${varName} = ${thenVarName};`);

  if (step.else) {
    lines.push(`} else {`);
    const elseCode = compileWorkflowSteps([step.else], structure, includeComments);
    const elseVarName = `step_${stepIndex}_else`;
    const renamedElseCode = elseCode.map(line =>
      line.replace(/step_0_result/g, elseVarName)
    );
    lines.push(...renamedElseCode.map(l => '  ' + l));
    lines.push(`  ${varName} = ${elseVarName};`);
  }

  lines.push(`}`);

  return lines;
}

function compileSelectStep(
  step: Extract<WorkflowStep, { type: 'select' }>,
  varName: string,
  structure: OrgStructure
): string[] {
  const role = structure.roles[step.role];
  const threadEnabled = !!role?.threadConfig?.enabled;
  return [
    `// Select ${threadEnabled ? 'thread' : 'agent'} from ${step.role} (${step.criteria || 'first'})`,
    `let ${varName} = (function() {`,
    `  let roleAgents = roleAssignments["${step.role}"] || [];`,
    `  if (roleAgents.length === 0) return null;`,
    `  return roleAgents[0]?.${threadEnabled ? 'threadId' : 'agentId'};`,
    `})();`,
  ];
}

function generateHelperFunctions(): string[] {
  return [
    `function calculateConfidence(results) {`,
    `  if (!results || results.length === 0) return 0;`,
    `  let sum = results.reduce((acc, r) => acc + (r?.confidence || 0), 0);`,
    `  return sum / results.length;`,
    `}`,
    ``,
    `function aggregateConsensus(results) {`,
    `  if (!Array.isArray(results)) return results;`,
    `  let counts = {};`,
    `  results.forEach(r => {`,
    `    let key = JSON.stringify(r?.result || r);`,
    `    counts[key] = (counts[key] || 0) + 1;`,
    `  });`,
    `  let maxKey = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);`,
    `  return JSON.parse(maxKey);`,
    `}`,
    ``,
    `function aggregateMajority(results) {`,
    `  if (!Array.isArray(results)) return results;`,
    `  let required = Math.ceil(results.length / 2);`,
    `  let counts = {};`,
    `  for (let r of results) {`,
    `    let key = JSON.stringify(r?.result || r);`,
    `    counts[key] = (counts[key] || 0) + 1;`,
    `    if (counts[key] >= required) return JSON.parse(key);`,
    `  }`,
    `  return null;`,
    `}`,
    ``,
    `function aggregateMerge(results) {`,
    `  if (!Array.isArray(results)) return results;`,
    `  return Object.assign({}, ...results.map(r => r?.result || r));`,
    `}`,
    ``,
    `function aggregateBest(results) {`,
    `  if (!Array.isArray(results)) return results;`,
    `  return results.reduce((best, curr) => {`,
    `    return (curr?.confidence || 0) > (best?.confidence || 0) ? curr : best;`,
    `  }, results[0]);`,
    `}`,
    ``,
    `function spawnRoleThread(roleId, objective) {`,
    `  return {`,
    `    type: "spawnThread",`,
    `    role: roleId,`,
    `    objective: objective,`,
    `    mode: roleExecution?.[roleId]?.mode || "agent"`,
    `  };`,
    `}`,
    ``,
    `function sendRoleThreadInput(roleId, worker, task, input) {`,
    `  return {`,
    `    type: "sendThreadInput",`,
    `    role: roleId,`,
    `    threadId: worker?.threadId,`,
    `    task: task,`,
    `    input: input`,
    `  };`,
    `}`,
    ``,
    `function awaitRoleThread(roleId, worker, eventType) {`,
    `  return {`,
    `    type: "awaitThread",`,
    `    role: roleId,`,
    `    threadId: worker?.threadId,`,
    `    eventType: eventType || "thread_turn_complete"`,
    `  };`,
    `}`,
  ];
}

function extractCapabilities(structure: OrgStructure): string[] {
  const capabilities = new Set<string>();

  for (const role of Object.values(structure.roles)) {
    for (const cap of role.capabilities || []) {
      capabilities.add(cap);
    }
  }

  return Array.from(capabilities);
}

function calculateAgentCounts(structure: OrgStructure): { min: number; max: number } {
  let min = 0;
  let max = 0;

  for (const role of Object.values(structure.roles)) {
    if (role.singleton) {
      min += 1;
      max += 1;
    } else {
      min += role.minInstances || 1;
      max += role.maxInstances || role.minInstances || 1;
    }
  }

  return { min, max };
}

function extractThreadMetadata(structure: OrgStructure): Record<string, any> {
  const roles = Object.entries(structure.roles)
    .filter(([_, role]) => role.threadConfig?.enabled)
    .map(([roleId, role]) => ({
      roleId,
      agentType: Array.isArray(role.agentType) ? role.agentType[0] : role.agentType,
      objective: role.threadConfig?.objective,
      approvalPreset: role.threadConfig?.approvalPreset,
    }));

  return {
    enabled: roles.length > 0,
    roles,
  };
}

function buildRoleExecutionMetadata(structure: OrgStructure): Record<string, any> {
  const entries = Object.entries(structure.roles).map(([roleId, role]) => [
    roleId,
    {
      mode: role.threadConfig?.enabled ? 'thread' : 'agent',
      agentType: Array.isArray(role.agentType) ? role.agentType[0] : role.agentType,
      approvalPreset: role.threadConfig?.approvalPreset,
    },
  ]);

  return Object.fromEntries(entries);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Load an org-chart pattern from a YAML file
 */
export async function loadOrgPatternFromFile(filePath: string): Promise<OrgPattern> {
  const content = await fs.readFile(filePath, 'utf-8');
  return yaml.load(content) as OrgPattern;
}

/**
 * Compile an org-chart YAML file to a .prism file
 */
export async function compileOrgPatternFile(
  yamlPath: string,
  outputPath?: string,
  options?: CompilerOptions
): Promise<string> {
  const pattern = await loadOrgPatternFromFile(yamlPath);
  const compiled = compileOrgPattern(pattern, options);

  // Build the Prism file with metadata header
  const prismContent = buildPrismFile(compiled);

  // Write to output file if specified
  const outPath = outputPath || yamlPath.replace(/\.ya?ml$/, '.prism');
  await fs.writeFile(outPath, prismContent, 'utf-8');

  return outPath;
}

/**
 * Build complete .prism file content with metadata header
 */
function buildPrismFile(compiled: CompiledPattern): string {
  const lines: string[] = [
    '/**',
    ` * @name ${compiled.metadata.name}`,
    ` * @version ${compiled.metadata.version}`,
    ` * @description ${compiled.metadata.description}`,
    ` * @input ${JSON.stringify(compiled.metadata.input)}`,
    ` * @agents ${JSON.stringify(compiled.metadata.agents)}`,
  ];

  if (compiled.metadata.agents.minAgents) {
    lines.push(` * @minAgents ${compiled.metadata.agents.minAgents}`);
  }
  if (compiled.metadata.agents.maxAgents) {
    lines.push(` * @maxAgents ${compiled.metadata.agents.maxAgents}`);
  }
  if (compiled.metadata.workspace) {
    lines.push(` * @workspace ${JSON.stringify(compiled.metadata.workspace)}`);
  }
  if (compiled.metadata.threads) {
    lines.push(` * @threads ${JSON.stringify(compiled.metadata.threads)}`);
  }
  if (compiled.metadata.metadata) {
    lines.push(` * @metadata ${JSON.stringify(compiled.metadata.metadata)}`);
  }

  lines.push(' */');
  lines.push('');
  lines.push(compiled.script);

  return lines.join('\n');
}
