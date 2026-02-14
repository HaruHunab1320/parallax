/**
 * Pattern Validation
 *
 * Validates org-chart patterns for correctness.
 */

import type {
  OrgPattern,
  OrgRole,
  OrgWorkflow,
  WorkflowStep,
  ValidationResult,
  ValidationError,
} from '../types';

/**
 * Validate an org-chart pattern
 */
export function validatePattern(pattern: OrgPattern): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate basic structure
  if (!pattern.name || typeof pattern.name !== 'string') {
    errors.push({
      path: 'name',
      message: 'Pattern name is required and must be a string',
      severity: 'error',
    });
  }

  if (!pattern.structure) {
    errors.push({
      path: 'structure',
      message: 'Pattern structure is required',
      severity: 'error',
    });
  } else {
    validateStructure(pattern.structure, errors, warnings);
  }

  if (!pattern.workflow) {
    errors.push({
      path: 'workflow',
      message: 'Pattern workflow is required',
      severity: 'error',
    });
  } else {
    validateWorkflow(pattern.workflow, pattern.structure, errors, warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate organizational structure
 */
function validateStructure(
  structure: { name?: string; roles?: Record<string, OrgRole> },
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!structure.name) {
    errors.push({
      path: 'structure.name',
      message: 'Structure name is required',
      severity: 'error',
    });
  }

  if (!structure.roles || Object.keys(structure.roles).length === 0) {
    errors.push({
      path: 'structure.roles',
      message: 'At least one role is required',
      severity: 'error',
    });
    return;
  }

  const roleIds = Object.keys(structure.roles);

  for (const [roleId, role] of Object.entries(structure.roles)) {
    // Validate capabilities
    if (!role.capabilities || !Array.isArray(role.capabilities)) {
      errors.push({
        path: `structure.roles.${roleId}.capabilities`,
        message: `Role "${roleId}" must have capabilities array`,
        severity: 'error',
      });
    } else if (role.capabilities.length === 0) {
      warnings.push({
        path: `structure.roles.${roleId}.capabilities`,
        message: `Role "${roleId}" has no capabilities`,
        severity: 'warning',
      });
    }

    // Validate reportsTo reference
    if (role.reportsTo && !roleIds.includes(role.reportsTo)) {
      errors.push({
        path: `structure.roles.${roleId}.reportsTo`,
        message: `Role "${roleId}" reports to unknown role "${role.reportsTo}"`,
        severity: 'error',
      });
    }

    // Validate instance counts
    if (role.singleton && (role.minInstances || role.maxInstances)) {
      warnings.push({
        path: `structure.roles.${roleId}`,
        message: `Role "${roleId}" is singleton but has instance counts defined`,
        severity: 'warning',
      });
    }

    if (role.minInstances !== undefined && role.maxInstances !== undefined) {
      if (role.minInstances > role.maxInstances) {
        errors.push({
          path: `structure.roles.${roleId}`,
          message: `Role "${roleId}" has minInstances > maxInstances`,
          severity: 'error',
        });
      }
    }
  }

  // Check for circular reportsTo
  checkCircularReporting(structure.roles, errors);
}

/**
 * Check for circular reporting chains
 */
function checkCircularReporting(
  roles: Record<string, OrgRole>,
  errors: ValidationError[]
): void {
  for (const [roleId, role] of Object.entries(roles)) {
    if (!role.reportsTo) continue;

    const visited = new Set<string>([roleId]);
    let current: string | undefined = role.reportsTo;

    while (current) {
      if (visited.has(current)) {
        errors.push({
          path: `structure.roles.${roleId}.reportsTo`,
          message: `Circular reporting chain detected: ${roleId} -> ${Array.from(visited).join(' -> ')} -> ${current}`,
          severity: 'error',
        });
        break;
      }

      visited.add(current);
      current = roles[current]?.reportsTo;
    }
  }
}

/**
 * Validate workflow
 */
function validateWorkflow(
  workflow: OrgWorkflow,
  structure: { roles?: Record<string, OrgRole> } | undefined,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!workflow.name) {
    errors.push({
      path: 'workflow.name',
      message: 'Workflow name is required',
      severity: 'error',
    });
  }

  if (!workflow.steps || !Array.isArray(workflow.steps)) {
    errors.push({
      path: 'workflow.steps',
      message: 'Workflow steps array is required',
      severity: 'error',
    });
    return;
  }

  if (workflow.steps.length === 0) {
    warnings.push({
      path: 'workflow.steps',
      message: 'Workflow has no steps',
      severity: 'warning',
    });
    return;
  }

  const roleIds = structure?.roles ? Object.keys(structure.roles) : [];

  workflow.steps.forEach((step, index) => {
    validateStep(step, `workflow.steps[${index}]`, roleIds, errors, warnings);
  });
}

/**
 * Validate a workflow step
 */
function validateStep(
  step: WorkflowStep,
  path: string,
  roleIds: string[],
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!step.type) {
    errors.push({
      path,
      message: 'Step type is required',
      severity: 'error',
    });
    return;
  }

  switch (step.type) {
    case 'assign':
      if (!step.role) {
        errors.push({
          path: `${path}.role`,
          message: 'Assign step requires a role',
          severity: 'error',
        });
      } else if (!roleIds.includes(step.role)) {
        errors.push({
          path: `${path}.role`,
          message: `Unknown role "${step.role}"`,
          severity: 'error',
        });
      }
      if (!step.task) {
        errors.push({
          path: `${path}.task`,
          message: 'Assign step requires a task',
          severity: 'error',
        });
      }
      break;

    case 'parallel':
    case 'sequential':
      if (!step.steps || !Array.isArray(step.steps)) {
        errors.push({
          path: `${path}.steps`,
          message: `${step.type} step requires steps array`,
          severity: 'error',
        });
      } else {
        step.steps.forEach((subStep, index) => {
          validateStep(subStep, `${path}.steps[${index}]`, roleIds, errors, warnings);
        });
      }
      break;

    case 'select':
      if (!step.role) {
        errors.push({
          path: `${path}.role`,
          message: 'Select step requires a role',
          severity: 'error',
        });
      } else if (!roleIds.includes(step.role)) {
        errors.push({
          path: `${path}.role`,
          message: `Unknown role "${step.role}"`,
          severity: 'error',
        });
      }
      break;

    case 'review':
      if (!step.reviewer) {
        errors.push({
          path: `${path}.reviewer`,
          message: 'Review step requires a reviewer',
          severity: 'error',
        });
      } else if (!roleIds.includes(step.reviewer)) {
        errors.push({
          path: `${path}.reviewer`,
          message: `Unknown reviewer role "${step.reviewer}"`,
          severity: 'error',
        });
      }
      break;

    case 'approve':
      if (!step.approver) {
        errors.push({
          path: `${path}.approver`,
          message: 'Approve step requires an approver',
          severity: 'error',
        });
      } else if (!roleIds.includes(step.approver)) {
        errors.push({
          path: `${path}.approver`,
          message: `Unknown approver role "${step.approver}"`,
          severity: 'error',
        });
      }
      break;

    case 'aggregate':
      const validMethods = ['consensus', 'majority', 'merge', 'best', 'custom'];
      if (!validMethods.includes(step.method)) {
        errors.push({
          path: `${path}.method`,
          message: `Invalid aggregate method "${step.method}". Valid methods: ${validMethods.join(', ')}`,
          severity: 'error',
        });
      }
      break;

    case 'condition':
      if (!step.check) {
        errors.push({
          path: `${path}.check`,
          message: 'Condition step requires a check expression',
          severity: 'error',
        });
      }
      if (!step.then) {
        errors.push({
          path: `${path}.then`,
          message: 'Condition step requires a then branch',
          severity: 'error',
        });
      } else {
        validateStep(step.then, `${path}.then`, roleIds, errors, warnings);
      }
      if (step.else) {
        validateStep(step.else, `${path}.else`, roleIds, errors, warnings);
      }
      break;

    case 'wait':
      // Wait step is optional
      break;

    default:
      warnings.push({
        path,
        message: `Unknown step type: ${(step as WorkflowStep).type}`,
        severity: 'warning',
      });
  }
}
