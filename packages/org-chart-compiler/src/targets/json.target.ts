/**
 * JSON Target
 *
 * Compiles org-chart patterns to JSON execution plans.
 */

import type {
  CompileTarget,
  CompileContext,
  OrgPattern,
  OrgRole,
  OrgWorkflow,
  WorkflowStep,
} from '../types';

export const jsonTarget: CompileTarget = {
  name: 'json',
  format: 'json',

  emitHeader(_pattern: OrgPattern, _ctx: CompileContext): string {
    return '';
  },

  emitRole(role: OrgRole, roleId: string, _ctx: CompileContext): string {
    return JSON.stringify({
      id: roleId,
      name: role.name || roleId,
      type: role.type,
      capabilities: role.capabilities,
      reportsTo: role.reportsTo,
      instances: {
        min: role.singleton ? 1 : (role.minInstances || 1),
        max: role.singleton ? 1 : (role.maxInstances || role.minInstances || 1),
        singleton: role.singleton || false,
      },
    });
  },

  emitWorkflow(workflow: OrgWorkflow, ctx: CompileContext): string {
    const plan = {
      name: workflow.name,
      description: workflow.description,
      input: workflow.input,
      steps: workflow.steps.map((step, index) =>
        JSON.parse(this.emitStep(step, index, ctx))
      ),
      output: workflow.output,
    };

    return JSON.stringify(plan);
  },

  emitStep(step: WorkflowStep, stepIndex: number, ctx: CompileContext): string {
    const base = {
      stepIndex,
      type: step.type,
    };

    switch (step.type) {
      case 'assign':
        return JSON.stringify({
          ...base,
          role: step.role,
          task: step.task,
          input: step.input,
          timeout: step.timeout,
        });

      case 'parallel':
        return JSON.stringify({
          ...base,
          steps: step.steps.map((s, i) => JSON.parse(this.emitStep(s, i, ctx))),
          maxConcurrency: step.maxConcurrency,
        });

      case 'sequential':
        return JSON.stringify({
          ...base,
          steps: step.steps.map((s, i) => JSON.parse(this.emitStep(s, i, ctx))),
        });

      case 'select':
        return JSON.stringify({
          ...base,
          role: step.role,
          criteria: step.criteria || 'first',
        });

      case 'review':
        return JSON.stringify({
          ...base,
          reviewer: step.reviewer,
          subject: step.subject,
          maxIterations: step.maxIterations,
        });

      case 'approve':
        return JSON.stringify({
          ...base,
          approver: step.approver,
          subject: step.subject,
        });

      case 'aggregate':
        return JSON.stringify({
          ...base,
          method: step.method,
          sources: step.sources,
          customFn: step.customFn,
        });

      case 'condition':
        return JSON.stringify({
          ...base,
          check: step.check,
          then: JSON.parse(this.emitStep(step.then, 0, ctx)),
          else: step.else ? JSON.parse(this.emitStep(step.else, 0, ctx)) : undefined,
        });

      case 'wait':
        return JSON.stringify({
          ...base,
          condition: step.condition,
          timeout: step.timeout,
        });

      default:
        return JSON.stringify(base);
    }
  },

  emitFooter(_pattern: OrgPattern, _ctx: CompileContext): string {
    return '';
  },

  join(parts: string[]): string {
    // For JSON, we construct the full object
    const nonEmpty = parts.filter(Boolean);
    if (nonEmpty.length === 0) return '{}';

    // The workflow part contains the main structure
    return nonEmpty[nonEmpty.length - 1];
  },
};

/**
 * Build complete JSON execution plan
 */
export function buildJsonPlan(pattern: OrgPattern): object {
  return {
    name: pattern.name,
    version: pattern.version || '1.0.0',
    description: pattern.description,
    structure: {
      name: pattern.structure.name,
      roles: Object.fromEntries(
        Object.entries(pattern.structure.roles).map(([id, role]) => [
          id,
          {
            name: role.name || id,
            type: role.type,
            capabilities: role.capabilities,
            reportsTo: role.reportsTo,
            instances: {
              min: role.singleton ? 1 : (role.minInstances || 1),
              max: role.singleton ? 1 : (role.maxInstances || role.minInstances || 1),
            },
          },
        ])
      ),
      routing: pattern.structure.routing,
      escalation: pattern.structure.escalation,
    },
    workflow: {
      name: pattern.workflow.name,
      input: pattern.workflow.input,
      steps: pattern.workflow.steps,
      output: pattern.workflow.output,
    },
    metadata: pattern.metadata,
  };
}
