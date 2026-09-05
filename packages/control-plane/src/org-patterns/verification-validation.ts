import type { OrgPattern, OrgRole, OrgVerify, VerifyOracle } from './types';

/** Only implemented verifier policies may enter the executor. */
export function normalizeVerification(value: unknown): OrgVerify {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const spec = Array.isArray(value)
    ? { oracles: value }
    : object(value) && 'oracles' in value
      ? value
      : { oracles: [value] };
  if (
    'combine' in spec &&
    spec.combine !== undefined &&
    spec.combine !== 'min'
  ) {
    throw new Error('Verification supports only combine: min');
  }
  if (Object.keys(spec).some((key) => !['oracles', 'combine'].includes(key))) {
    throw new Error('Unknown verification configuration field');
  }
  if (!Array.isArray(spec.oracles) || spec.oracles.length === 0) {
    throw new Error('Verification requires at least one oracle');
  }
  for (const oracle of spec.oracles) {
    if (!object(oracle)) throw new Error('Invalid verification oracle');
    const allowed: Record<string, string[]> = {
      command: [
        'type',
        'run',
        'cwd',
        'timeoutMs',
        'passConfidence',
        'failConfidence',
        'scorePattern',
      ],
      agent: ['type', 'role', 'rubric'],
      history: [
        'type',
        'halfLifeDays',
        'minRuns',
        'saturationRuns',
        'maxRuns',
        'drift',
        'driftRecentN',
        'driftThreshold',
        'pool',
        'poolFamily',
        'poolWeight',
      ],
    };
    const fields = allowed[String(oracle.type)];
    if (!fields)
      throw new Error(
        `Unsupported verification oracle: ${String(oracle.type)}`
      );
    if (Object.keys(oracle).some((key) => !fields.includes(key))) {
      throw new Error(
        `Unknown ${oracle.type} verification configuration field`
      );
    }
    for (const key of [
      'passConfidence',
      'failConfidence',
      'driftThreshold',
      'poolWeight',
    ]) {
      const value = oracle[key];
      if (
        value !== undefined &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 1)
      ) {
        throw new Error(`Verification ${key} must be between 0 and 1`);
      }
    }
    for (const key of [
      'timeoutMs',
      'halfLifeDays',
      'minRuns',
      'saturationRuns',
      'maxRuns',
      'driftRecentN',
    ]) {
      const value = oracle[key];
      if (
        value !== undefined &&
        (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
      ) {
        throw new Error(`Verification ${key} must be positive`);
      }
    }
    for (const key of [
      'run',
      'cwd',
      'role',
      'rubric',
      'scorePattern',
      'poolFamily',
    ]) {
      const value = oracle[key];
      if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
        throw new Error(`Verification ${key} must be a non-empty string`);
      }
    }
    for (const key of ['drift', 'pool']) {
      if (oracle[key] !== undefined && typeof oracle[key] !== 'boolean') {
        throw new Error(`Verification ${key} must be boolean`);
      }
    }
    if (oracle.type === 'command' && typeof oracle.run !== 'string') {
      throw new Error('Command verification requires run');
    }
    if (typeof oracle.scorePattern === 'string') {
      try {
        new RegExp(oracle.scorePattern);
      } catch {
        throw new Error(
          'Verification scorePattern is not a valid regular expression'
        );
      }
    }
  }
  return spec as unknown as OrgVerify;
}

export function validateOrgVerification(pattern: OrgPattern): void {
  if (!pattern?.structure?.roles || !Array.isArray(pattern.workflow?.steps)) {
    throw new Error('Org pattern requires structure.roles and workflow.steps');
  }
  for (const [roleId, role] of Object.entries(pattern.structure.roles)) {
    if (!role || typeof role !== 'object')
      throw new Error(`Invalid role: ${roleId}`);
    if ('combine' in role)
      throw new Error(
        `Role ${roleId}: put combine inside verify.oracles configuration`
      );
    if (role.confidence) {
      for (const [key, value] of Object.entries(role.confidence)) {
        if (
          !['accept', 'retryBelow', 'escalateBelow'].includes(key) ||
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 1
        ) {
          throw new Error(`Role ${roleId}: invalid confidence policy ${key}`);
        }
      }
    }
    if (role.verify !== undefined) {
      for (const oracle of normalizeVerification(role.verify).oracles) {
        validateReviewer(oracle, role, pattern);
      }
    }
  }
  const validateSteps = (steps: unknown[]) => {
    for (const value of steps) {
      const step = value as Record<string, unknown> | null;
      if (!step || typeof step !== 'object')
        throw new Error('Invalid workflow step');
      if (step.type === 'parallel' || step.type === 'sequential') {
        if (!Array.isArray(step.steps))
          throw new Error(`${step.type} requires steps`);
        validateSteps(step.steps);
      } else if (step.type === 'condition') {
        validateSteps([step.then, ...(step.else ? [step.else] : [])]);
      } else if (
        !['assign', 'select', 'review', 'approve', 'aggregate'].includes(
          String(step.type)
        )
      ) {
        throw new Error(`Unsupported workflow step: ${String(step.type)}`);
      }
      const roleId = step.role ?? step.reviewer ?? step.approver;
      if (
        roleId !== undefined &&
        (typeof roleId !== 'string' || !pattern.structure.roles[roleId])
      ) {
        throw new Error(
          `Workflow step references missing role: ${String(roleId)}`
        );
      }
    }
  };
  validateSteps(pattern.workflow.steps);
}

function validateReviewer(
  oracle: VerifyOracle,
  role: OrgRole,
  pattern: OrgPattern
): void {
  if (oracle.type !== 'agent') return;
  const reviewer = oracle.role ?? role.reportsTo;
  if (!reviewer || !pattern.structure.roles[reviewer]) {
    throw new Error(
      `Role ${role.id}: agent verification requires an available reviewer role`
    );
  }
}
