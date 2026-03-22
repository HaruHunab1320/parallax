/**
 * Org-Chart to Prism Compiler
 *
 * Translates declarative org-chart YAML patterns into executable Prism scripts.
 * This ensures a single execution engine (Prism/RuntimeManager) while allowing
 * multiple input formats.
 */

import { OrgPattern, WorkflowStep, OrgStructure } from './types';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';

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
  // Build each role's agent array, then assemble roleAssignments as one object literal
  lines.push('// Map agents to roles');
  const roleIds = Object.keys(pattern.structure.roles);
  let agentIndex = 0;
  for (const [roleId, role] of Object.entries(pattern.structure.roles)) {
    const count = role.singleton ? 1 : (role.minInstances || 1);
    lines.push(`let _roleAgents_${roleId} = [];`);
    lines.push(`let _ri_${roleId} = ${agentIndex};`);
    lines.push(`while (_ri_${roleId} < ${agentIndex + count}) {`);
    lines.push(`  if (_ri_${roleId} < agentResults.length) {`);
    lines.push(`    _roleAgents_${roleId} = [..._roleAgents_${roleId}, agentResults[_ri_${roleId}]];`);
    lines.push(`  }`);
    lines.push(`  _ri_${roleId} = _ri_${roleId} + 1;`);
    lines.push(`}`);
    agentIndex += count;
  }
  // Assemble as a single object literal (Prism doesn't support obj["key"] = value)
  lines.push(`let roleAssignments = {`);
  roleIds.forEach((roleId, i) => {
    const comma = i < roleIds.length - 1 ? ',' : '';
    lines.push(`  ${roleId}: _roleAgents_${roleId}${comma}`);
  });
  lines.push(`};`);
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

  const lines: string[] = [
    `// Assign task to ${roleName}`,
    `let _assign_roleAgents_${varName} = roleAssignments["${step.role}"] ?? [];`,
  ];

  if (threadEnabled) {
    lines.push(`// Explicit thread-backed orchestration for this role`);
    lines.push(`let _assign_agent_${varName} = _assign_roleAgents_${varName}[0];`);
    lines.push(`let _assign_threadOps_${varName} = {`);
    lines.push(`  spawn: spawnRoleThread("${step.role}", ${JSON.stringify(step.task)}),`);
    lines.push(`  input: sendRoleThreadInput("${step.role}", _assign_agent_${varName}, ${JSON.stringify(step.task)}, ${JSON.stringify(step.input || null)}),`);
    lines.push(`  awaitResult: awaitRoleThread("${step.role}", _assign_agent_${varName}, "thread_turn_complete")`);
    lines.push(`};`);
    lines.push(`let ${varName} = null;`);
    lines.push(`if (_assign_roleAgents_${varName}.length == 0) {`);
    lines.push(`  ${varName} = { error: "No agents for role: ${step.role}", confidence: 0 };`);
    lines.push(`} else {`);
    lines.push(`  ${varName} = {`);
    lines.push(`    role: "${step.role}",`);
    lines.push(`    task: ${JSON.stringify(step.task)},`);
    lines.push(`    mode: "thread",`);
    lines.push(`    thread: _assign_threadOps_${varName},`);
    lines.push(`    result: _assign_threadOps_${varName}.awaitResult,`);
    lines.push(`    confidence: 0.8,`);
    lines.push(`    agentId: _assign_agent_${varName}?.agentId,`);
    lines.push(`    threadId: _assign_agent_${varName}?.threadId`);
    lines.push(`  };`);
    lines.push(`}`);
  } else {
    lines.push(`// Get result from first available agent in this role`);
    lines.push(`let _assign_agent_${varName} = _assign_roleAgents_${varName}[0];`);
    lines.push(`let ${varName} = null;`);
    lines.push(`if (_assign_roleAgents_${varName}.length == 0) {`);
    lines.push(`  ${varName} = { error: "No agents for role: ${step.role}", confidence: 0 };`);
    lines.push(`} else {`);
    lines.push(`  ${varName} = {`);
    lines.push(`    role: "${step.role}",`);
    lines.push(`    task: ${JSON.stringify(step.task)},`);
    lines.push(`    result: _assign_agent_${varName}?.result,`);
    lines.push(`    confidence: _assign_agent_${varName}?.confidence ?? 0.7,`);
    lines.push(`    agentId: _assign_agent_${varName}?.agentId`);
    lines.push(`  };`);
    lines.push(`}`);
  }

  return lines;
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
    // Rename variable identifiers only (not inside string literals)
    const renamedCode = subCode.map(line => {
      const parts = line.split('"');
      const result = parts.map((part, i) => {
        if (i % 2 === 0) {
          // Outside quotes — replace step_0_result including as suffix in compound names
          return part.replace(/step_0_result/g, subVarName);
        }
        return part;
      });
      return result.join('"');
    });
    lines.push(...renamedCode);
    lines.push(`${varName} = [...${varName}, ${subVarName}];`);
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
    const renamedCode = subCode.map(line => {
      const parts = line.split('"');
      const result = parts.map((part, i) => {
        if (i % 2 === 0) {
          return part.replace(/step_0_result/g, subVarName);
        }
        return part;
      });
      return result.join('"');
    });
    lines.push(...renamedCode);
    lines.push(`${varName} = [...${varName}, ${subVarName}];`);
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

  const lines: string[] = [
    `// Review by ${roleName}`,
    `let _review_agents_${varName} = roleAssignments["${step.reviewer}"] ?? [];`,
    `let _review_reviewer_${varName} = _review_agents_${varName}[0];`,
  ];

  if (threadEnabled) {
    lines.push(`let _review_thread_${varName} = sendRoleThreadInput("${step.reviewer}", _review_reviewer_${varName}, "review", ${JSON.stringify(step.subject)});`);
  }

  lines.push(`let ${varName} = null;`);
  lines.push(`if (_review_agents_${varName}.length == 0) {`);
  lines.push(`  ${varName} = { approved: true, confidence: 0.5, reason: "No reviewer available" };`);
  lines.push(`} else {`);
  lines.push(`  let _review_approved_${varName} = (_review_reviewer_${varName}?.confidence ?? 0) > 0.6;`);
  lines.push(`  let _review_feedback_${varName} = "Needs revision";`);
  lines.push(`  if (_review_approved_${varName}) {`);
  lines.push(`    _review_feedback_${varName} = "Looks good";`);
  lines.push(`  }`);
  lines.push(`  ${varName} = {`);
  lines.push(`    reviewer: "${step.reviewer}",`);
  lines.push(`    approved: _review_approved_${varName},`);
  lines.push(`    confidence: _review_reviewer_${varName}?.confidence ?? 0.7,`);
  if (threadEnabled) {
    lines.push(`    thread: _review_thread_${varName},`);
  }
  lines.push(`    feedback: _review_feedback_${varName}`);
  lines.push(`  };`);
  lines.push(`}`);

  return lines;
}

function compileApproveStep(
  step: Extract<WorkflowStep, { type: 'approve' }>,
  varName: string,
  structure: OrgStructure
): string[] {
  const role = structure.roles[step.approver];
  const threadEnabled = !!role?.threadConfig?.enabled;

  const lines: string[] = [
    `// Approval by ${step.approver}`,
    `let _approve_agents_${varName} = roleAssignments["${step.approver}"] ?? [];`,
    `let _approve_approver_${varName} = _approve_agents_${varName}[0];`,
  ];

  if (threadEnabled) {
    lines.push(`let _approve_thread_${varName} = sendRoleThreadInput("${step.approver}", _approve_approver_${varName}, "approve", ${JSON.stringify(step.subject)});`);
  }

  lines.push(`let ${varName} = null;`);
  lines.push(`if (_approve_agents_${varName}.length == 0) {`);
  lines.push(`  ${varName} = { approved: false, reason: "No approver available" };`);
  lines.push(`} else {`);
  lines.push(`  let _approve_approved_${varName} = (_approve_approver_${varName}?.confidence ?? 0) > 0.7;`);
  lines.push(`  ${varName} = {`);
  lines.push(`    approver: "${step.approver}",`);
  lines.push(`    approved: _approve_approved_${varName},`);
  lines.push(`    confidence: _approve_approver_${varName}?.confidence ?? 0.7,`);
  if (threadEnabled) {
    lines.push(`    thread: _approve_thread_${varName}`);
  } else {
    lines.push(`    agentId: _approve_approver_${varName}?.agentId`);
  }
  lines.push(`  };`);
  lines.push(`}`);

  return lines;
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
  const field = threadEnabled ? 'threadId' : 'agentId';
  return [
    `// Select ${threadEnabled ? 'thread' : 'agent'} from ${step.role} (${step.criteria || 'first'})`,
    `let _select_agents_${varName} = roleAssignments["${step.role}"] ?? [];`,
    `let ${varName} = null;`,
    `if (_select_agents_${varName}.length > 0) {`,
    `  ${varName} = _select_agents_${varName}[0]?.${field};`,
    `}`,
  ];
}

function generateHelperFunctions(): string[] {
  return [
    `function calculateConfidence(results) {`,
    `  if (!results) { return 0; }`,
    `  if (results.length == 0) { return 0; }`,
    `  let sum = 0;`,
    `  let i = 0;`,
    `  while (i < results.length) {`,
    `    sum = sum + (results[i]?.confidence ?? 0);`,
    `    i = i + 1;`,
    `  }`,
    `  return sum / results.length;`,
    `}`,
    ``,
    `function aggregateConsensus(results) {`,
    `  if (!results) { return results; }`,
    `  // Simple: return the first result (consensus approximation)`,
    `  if (results.length == 0) { return null; }`,
    `  return results[0]?.result ?? results[0];`,
    `}`,
    ``,
    `function aggregateMajority(results) {`,
    `  if (!results) { return results; }`,
    `  if (results.length == 0) { return null; }`,
    `  return results[0]?.result ?? results[0];`,
    `}`,
    ``,
    `function aggregateMerge(results) {`,
    `  if (!results) { return results; }`,
    `  let merged = {};`,
    `  let i = 0;`,
    `  while (i < results.length) {`,
    `    let item = results[i]?.result ?? results[i];`,
    `    if (item) {`,
    `      merged = { ...merged, ...item };`,
    `    }`,
    `    i = i + 1;`,
    `  }`,
    `  return merged;`,
    `}`,
    ``,
    `function aggregateBest(results) {`,
    `  if (!results) { return results; }`,
    `  if (results.length == 0) { return null; }`,
    `  let best = results[0];`,
    `  let i = 1;`,
    `  while (i < results.length) {`,
    `    let curr = results[i];`,
    `    if ((curr?.confidence ?? 0) > (best?.confidence ?? 0)) {`,
    `      best = curr;`,
    `    }`,
    `    i = i + 1;`,
    `  }`,
    `  return best;`,
    `}`,
    ``,
    `function spawnRoleThread(roleId, objective) {`,
    `  return {`,
    `    type: "spawnThread",`,
    `    role: roleId,`,
    `    objective: objective,`,
    `    mode: "thread"`,  // Default to thread; roleExecution metadata is in the pattern header
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
    `    eventType: eventType ?? "thread_turn_complete"`,
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
