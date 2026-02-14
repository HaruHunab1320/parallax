import { describe, it, expect } from 'vitest';
import { validatePattern } from './validator';
import type { OrgPattern } from '../types';

describe('validatePattern', () => {
  const validPattern: OrgPattern = {
    name: 'test-pattern',
    structure: {
      name: 'Test Structure',
      roles: {
        worker: {
          capabilities: ['work'],
        },
      },
    },
    workflow: {
      name: 'test-workflow',
      steps: [{ type: 'assign', role: 'worker', task: 'Do work' }],
    },
  };

  it('should validate a correct pattern', () => {
    const result = validatePattern(validPattern);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  describe('pattern name validation', () => {
    it('should require pattern name', () => {
      const pattern = { ...validPattern, name: '' };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'name')).toBe(true);
    });
  });

  describe('structure validation', () => {
    it('should require structure', () => {
      const pattern = { name: 'test', workflow: validPattern.workflow } as OrgPattern;
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'structure')).toBe(true);
    });

    it('should require structure name', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        structure: {
          ...validPattern.structure,
          name: '',
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'structure.name')).toBe(true);
    });

    it('should require at least one role', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        structure: {
          name: 'Test',
          roles: {},
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'structure.roles')).toBe(true);
    });
  });

  describe('role validation', () => {
    it('should require capabilities array', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        structure: {
          name: 'Test',
          roles: {
            worker: {} as any,
          },
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('capabilities'))).toBe(true);
    });

    it('should warn on empty capabilities', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        structure: {
          name: 'Test',
          roles: {
            worker: { capabilities: [] },
          },
        },
      };
      const result = validatePattern(pattern);
      expect(result.warnings.some(w => w.path.includes('capabilities'))).toBe(true);
    });

    it('should catch invalid reportsTo reference', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        structure: {
          name: 'Test',
          roles: {
            worker: {
              capabilities: ['work'],
              reportsTo: 'nonexistent',
            },
          },
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('nonexistent'))).toBe(true);
    });

    it('should catch circular reporting', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        structure: {
          name: 'Test',
          roles: {
            a: { capabilities: ['work'], reportsTo: 'b' },
            b: { capabilities: ['work'], reportsTo: 'c' },
            c: { capabilities: ['work'], reportsTo: 'a' },
          },
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Circular'))).toBe(true);
    });

    it('should catch minInstances > maxInstances', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        structure: {
          name: 'Test',
          roles: {
            worker: {
              capabilities: ['work'],
              minInstances: 5,
              maxInstances: 2,
            },
          },
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('minInstances > maxInstances'))).toBe(true);
    });
  });

  describe('workflow validation', () => {
    it('should require workflow', () => {
      const pattern = { name: 'test', structure: validPattern.structure } as OrgPattern;
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'workflow')).toBe(true);
    });

    it('should require workflow name', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        workflow: { ...validPattern.workflow, name: '' },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'workflow.name')).toBe(true);
    });

    it('should warn on empty steps', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        workflow: { name: 'test', steps: [] },
      };
      const result = validatePattern(pattern);
      expect(result.warnings.some(w => w.message.includes('no steps'))).toBe(true);
    });
  });

  describe('step validation', () => {
    it('should require step type', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        workflow: {
          name: 'test',
          steps: [{} as any],
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('type is required'))).toBe(true);
    });

    it('should validate assign step role', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        workflow: {
          name: 'test',
          steps: [{ type: 'assign', role: 'nonexistent', task: 'test' }],
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Unknown role'))).toBe(true);
    });

    it('should validate review step reviewer', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        workflow: {
          name: 'test',
          steps: [{ type: 'review', reviewer: 'nonexistent', subject: 'x' }],
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Unknown reviewer'))).toBe(true);
    });

    it('should validate aggregate method', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        workflow: {
          name: 'test',
          steps: [{ type: 'aggregate', method: 'invalid' as any }],
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid aggregate method'))).toBe(true);
    });

    it('should validate condition step', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        workflow: {
          name: 'test',
          steps: [{ type: 'condition', check: '', then: null as any }],
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('check expression'))).toBe(true);
      expect(result.errors.some(e => e.message.includes('then branch'))).toBe(true);
    });

    it('should validate nested steps in parallel', () => {
      const pattern: OrgPattern = {
        ...validPattern,
        workflow: {
          name: 'test',
          steps: [
            {
              type: 'parallel',
              steps: [{ type: 'assign', role: 'nonexistent', task: 'test' }],
            },
          ],
        },
      };
      const result = validatePattern(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Unknown role'))).toBe(true);
    });
  });
});
