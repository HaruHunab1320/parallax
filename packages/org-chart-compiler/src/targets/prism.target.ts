/**
 * Prism Target
 *
 * Compiles org-chart patterns to Prism DSL code.
 */

import type {
  CompileTarget,
  CompileContext,
  OrgPattern,
  OrgRole,
  OrgWorkflow,
  WorkflowStep,
} from '../types';

export const prismTarget: CompileTarget = {
  name: 'prism',
  format: 'code',

  emitHeader(pattern: OrgPattern, ctx: CompileContext): string {
    const lines: string[] = [];

    if (ctx.includeComments) {
      lines.push(`// Auto-generated from org-chart pattern: ${pattern.name}`);
      lines.push(`// Generated at: ${new Date().toISOString()}`);
      lines.push('');
    }

    return lines.join('\n');
  },

  emitRole(role: OrgRole, roleId: string, ctx: CompileContext): string {
    const lines: string[] = [];

    if (ctx.includeComments) {
      lines.push(`// Role: ${role.name || roleId}`);
    }

    return lines.join('\n');
  },

  emitWorkflow(workflow: OrgWorkflow, ctx: CompileContext): string {
    const lines: string[] = [];

    if (ctx.includeComments) {
      lines.push('// === Workflow Execution ===');
    }

    // Generate role assignments
    const roleIds = Object.keys(ctx.pattern.structure.roles);
    lines.push(`let roles = ${JSON.stringify(roleIds, null, 2)};`);
    lines.push('');

    // Map agents to roles
    lines.push('// Map agents to roles');
    lines.push('let roleAssignments = {};');

    let agentIndex = 0;
    for (const [roleId, role] of Object.entries(ctx.pattern.structure.roles)) {
      const count = role.singleton ? 1 : (role.minInstances || 1);
      lines.push(`roleAssignments["${roleId}"] = agentResults.slice(${agentIndex}, ${agentIndex + count});`);
      agentIndex += count;
    }
    lines.push('');

    // Generate steps
    workflow.steps.forEach((step, index) => {
      lines.push(this.emitStep(step, index, ctx));
      lines.push('');
    });

    // Generate output
    if (ctx.includeComments) {
      lines.push('// === Final Output ===');
    }

    const outputVar = workflow.output || `step_${workflow.steps.length - 1}_result`;
    lines.push(`let finalResult = {`);
    lines.push(`  patternName: "${ctx.pattern.name}",`);
    lines.push(`  workflow: "${workflow.name}",`);
    lines.push(`  result: ${outputVar},`);
    lines.push(`  roles: roles,`);
    lines.push(`  agentsUsed: agentResults.length,`);
    lines.push(`  confidence: calculateConfidence(agentResults)`);
    lines.push(`};`);
    lines.push('');
    lines.push('finalResult');

    return lines.join('\n');
  },

  emitStep(step: WorkflowStep, stepIndex: number, ctx: CompileContext): string {
    const varName = `step_${stepIndex}_result`;

    switch (step.type) {
      case 'assign':
        return emitAssignStep(step, varName, ctx);
      case 'parallel':
        return emitParallelStep(step, varName, stepIndex, ctx);
      case 'sequential':
        return emitSequentialStep(step, varName, stepIndex, ctx);
      case 'review':
        return emitReviewStep(step, varName, ctx);
      case 'approve':
        return emitApproveStep(step, varName, ctx);
      case 'aggregate':
        return emitAggregateStep(step, varName, stepIndex);
      case 'condition':
        return emitConditionStep(step, varName, stepIndex, ctx);
      case 'select':
        return emitSelectStep(step, varName);
      case 'wait':
        return `let ${varName} = null; // Wait step`;
      default:
        return `let ${varName} = null; // Unknown step type`;
    }
  },

  emitFooter(_pattern: OrgPattern, ctx: CompileContext): string {
    const lines: string[] = [];

    if (ctx.includeComments) {
      lines.push('// === Helper Functions ===');
    }

    lines.push(...helperFunctions);

    return lines.join('\n');
  },

  join(parts: string[]): string {
    return parts.filter(Boolean).join('\n\n');
  },
};

function emitAssignStep(
  step: Extract<WorkflowStep, { type: 'assign' }>,
  varName: string,
  ctx: CompileContext
): string {
  const lines: string[] = [];
  const role = ctx.pattern.structure.roles[step.role];
  const roleName = role?.name || step.role;

  if (ctx.includeComments) {
    lines.push(`// Assign task to ${roleName}`);
  }

  lines.push(
    `let ${varName} = (function() {`,
    `  let roleAgents = roleAssignments["${step.role}"] || [];`,
    `  if (roleAgents.length === 0) {`,
    `    return { error: "No agents for role: ${step.role}", confidence: 0 };`,
    `  }`,
    `  let agent = roleAgents[0];`,
    `  return {`,
    `    role: "${step.role}",`,
    `    task: ${JSON.stringify(step.task)},`,
    `    result: agent?.result,`,
    `    confidence: agent?.confidence || 0.7,`,
    `    agentId: agent?.agentId`,
    `  };`,
    `})();`
  );

  return lines.join('\n');
}

function emitParallelStep(
  step: Extract<WorkflowStep, { type: 'parallel' }>,
  varName: string,
  stepIndex: number,
  ctx: CompileContext
): string {
  const lines: string[] = [`let ${varName} = [];`];

  step.steps.forEach((subStep, subIndex) => {
    const subVarName = `step_${stepIndex}_sub_${subIndex}`;
    const subCode = prismTarget.emitStep(subStep, 0, ctx);
    const renamedCode = subCode.replace(/step_0_result/g, subVarName);
    lines.push(renamedCode);
    lines.push(`${varName}.push(${subVarName});`);
  });

  return lines.join('\n');
}

function emitSequentialStep(
  step: Extract<WorkflowStep, { type: 'sequential' }>,
  varName: string,
  stepIndex: number,
  ctx: CompileContext
): string {
  const lines: string[] = [`let ${varName} = [];`];

  step.steps.forEach((subStep, subIndex) => {
    const subVarName = `step_${stepIndex}_seq_${subIndex}`;
    const subCode = prismTarget.emitStep(subStep, 0, ctx);
    const renamedCode = subCode.replace(/step_0_result/g, subVarName);
    lines.push(renamedCode);
    lines.push(`${varName}.push(${subVarName});`);
  });

  return lines.join('\n');
}

function emitReviewStep(
  step: Extract<WorkflowStep, { type: 'review' }>,
  varName: string,
  ctx: CompileContext
): string {
  const role = ctx.pattern.structure.roles[step.reviewer];
  const roleName = role?.name || step.reviewer;

  return [
    `// Review by ${roleName}`,
    `let ${varName} = (function() {`,
    `  let reviewerAgents = roleAssignments["${step.reviewer}"] || [];`,
    `  if (reviewerAgents.length === 0) {`,
    `    return { approved: true, confidence: 0.5, reason: "No reviewer available" };`,
    `  }`,
    `  let reviewer = reviewerAgents[0];`,
    `  let approved = (reviewer?.confidence || 0) > 0.6;`,
    `  return {`,
    `    reviewer: "${step.reviewer}",`,
    `    approved: approved,`,
    `    confidence: reviewer?.confidence || 0.7,`,
    `    feedback: approved ? "Looks good" : "Needs revision"`,
    `  };`,
    `})();`,
  ].join('\n');
}

function emitApproveStep(
  step: Extract<WorkflowStep, { type: 'approve' }>,
  varName: string,
  _ctx: CompileContext
): string {
  return [
    `// Approval by ${step.approver}`,
    `let ${varName} = (function() {`,
    `  let approverAgents = roleAssignments["${step.approver}"] || [];`,
    `  if (approverAgents.length === 0) {`,
    `    return { approved: false, reason: "No approver available" };`,
    `  }`,
    `  let approver = approverAgents[0];`,
    `  let approved = (approver?.confidence || 0) > 0.7;`,
    `  return {`,
    `    approver: "${step.approver}",`,
    `    approved: approved,`,
    `    confidence: approver?.confidence || 0.7`,
    `  };`,
    `})();`,
  ].join('\n');
}

function emitAggregateStep(
  step: Extract<WorkflowStep, { type: 'aggregate' }>,
  varName: string,
  stepIndex: number
): string {
  const prevVar = `step_${stepIndex - 1}_result`;
  const methodName = step.method.charAt(0).toUpperCase() + step.method.slice(1);
  return `// Aggregate results using: ${step.method}\nlet ${varName} = aggregate${methodName}(${prevVar});`;
}

function emitConditionStep(
  step: Extract<WorkflowStep, { type: 'condition' }>,
  varName: string,
  stepIndex: number,
  ctx: CompileContext
): string {
  const lines: string[] = [];

  const checkExpr = step.check.startsWith('$')
    ? step.check.replace(/\$\{?(\w+)\}?/g, '$1')
    : step.check;

  lines.push(`let ${varName};`);
  lines.push(`if (${checkExpr}) {`);

  const thenVarName = `step_${stepIndex}_then`;
  const thenCode = prismTarget.emitStep(step.then, 0, ctx);
  const renamedThenCode = thenCode.replace(/step_0_result/g, thenVarName);
  lines.push(renamedThenCode.split('\n').map(l => '  ' + l).join('\n'));
  lines.push(`  ${varName} = ${thenVarName};`);

  if (step.else) {
    lines.push(`} else {`);
    const elseVarName = `step_${stepIndex}_else`;
    const elseCode = prismTarget.emitStep(step.else, 0, ctx);
    const renamedElseCode = elseCode.replace(/step_0_result/g, elseVarName);
    lines.push(renamedElseCode.split('\n').map(l => '  ' + l).join('\n'));
    lines.push(`  ${varName} = ${elseVarName};`);
  }

  lines.push(`}`);

  return lines.join('\n');
}

function emitSelectStep(
  step: Extract<WorkflowStep, { type: 'select' }>,
  varName: string
): string {
  return [
    `// Select agent from ${step.role} (${step.criteria || 'first'})`,
    `let ${varName} = (function() {`,
    `  let roleAgents = roleAssignments["${step.role}"] || [];`,
    `  if (roleAgents.length === 0) return null;`,
    `  return roleAgents[0]?.agentId;`,
    `})();`,
  ].join('\n');
}

const helperFunctions = [
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
];
