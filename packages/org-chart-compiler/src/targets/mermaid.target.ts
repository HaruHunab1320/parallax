/**
 * Mermaid Target
 *
 * Compiles org-chart patterns to Mermaid diagram syntax.
 */

import type {
  CompileTarget,
  CompileContext,
  OrgPattern,
  OrgRole,
  OrgWorkflow,
  WorkflowStep,
} from '../types';

export const mermaidTarget: CompileTarget = {
  name: 'mermaid',
  format: 'code',

  emitHeader(pattern: OrgPattern, ctx: CompileContext): string {
    const lines: string[] = [];

    if (ctx.includeComments) {
      lines.push(`%% Org Chart: ${pattern.name}`);
    }

    lines.push('graph TD');
    lines.push('');

    return lines.join('\n');
  },

  emitRole(role: OrgRole, roleId: string, _ctx: CompileContext): string {
    const lines: string[] = [];
    const label = role.name || roleId;
    const caps = role.capabilities?.slice(0, 2).join(', ') || '';

    // Node definition
    lines.push(`    ${roleId}["${label}<br/><small>${caps}</small>"]`);

    // Reporting relationship
    if (role.reportsTo) {
      lines.push(`    ${roleId} -->|reports to| ${role.reportsTo}`);
    }

    return lines.join('\n');
  },

  emitWorkflow(workflow: OrgWorkflow, ctx: CompileContext): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('    subgraph Workflow[" "]');
    lines.push(`        direction LR`);

    let prevNode: string | null = null;

    workflow.steps.forEach((step, index) => {
      const nodeId = `step_${index}`;
      const stepDef = this.emitStep(step, index, ctx);
      lines.push(`        ${stepDef}`);

      if (prevNode) {
        lines.push(`        ${prevNode} --> ${nodeId}`);
      }

      prevNode = nodeId;
    });

    lines.push('    end');

    return lines.join('\n');
  },

  emitStep(step: WorkflowStep, stepIndex: number, _ctx: CompileContext): string {
    const nodeId = `step_${stepIndex}`;

    switch (step.type) {
      case 'assign':
        return `${nodeId}[/"${step.role}: ${truncate(step.task, 20)}"/]`;

      case 'parallel':
        return `${nodeId}{{Parallel: ${step.steps.length} steps}}`;

      case 'sequential':
        return `${nodeId}[Sequential: ${step.steps.length} steps]`;

      case 'review':
        return `${nodeId}(Review by ${step.reviewer})`;

      case 'approve':
        return `${nodeId}((Approve: ${step.approver}))`;

      case 'aggregate':
        return `${nodeId}[Aggregate: ${step.method}]`;

      case 'condition':
        return `${nodeId}{${truncate(step.check, 15)}}`;

      case 'select':
        return `${nodeId}[Select: ${step.role}]`;

      case 'wait':
        return `${nodeId}([Wait])`;

      default:
        return `${nodeId}[Unknown]`;
    }
  },

  emitFooter(pattern: OrgPattern, _ctx: CompileContext): string {
    const lines: string[] = [];

    // Add styling
    lines.push('');
    lines.push('    classDef roleNode fill:#e1f5fe,stroke:#01579b');
    lines.push('    classDef stepNode fill:#fff3e0,stroke:#e65100');

    // Apply classes
    const roleIds = Object.keys(pattern.structure.roles);
    if (roleIds.length > 0) {
      lines.push(`    class ${roleIds.join(',')} roleNode`);
    }

    const stepIds = pattern.workflow.steps.map((_, i) => `step_${i}`);
    if (stepIds.length > 0) {
      lines.push(`    class ${stepIds.join(',')} stepNode`);
    }

    return lines.join('\n');
  },

  join(parts: string[]): string {
    return parts.filter(Boolean).join('\n');
  },
};

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
