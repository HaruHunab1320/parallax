import { describe, it, expect } from 'vitest';
import { OrgChartCompiler, createTarget } from './compiler';
import type { OrgPattern, CompileTarget } from './types';

const samplePattern: OrgPattern = {
  name: 'test-team',
  version: '1.0.0',
  description: 'Test pattern',
  structure: {
    name: 'Test Structure',
    roles: {
      engineer: {
        name: 'Engineer',
        capabilities: ['coding', 'testing'],
        minInstances: 2,
      },
      reviewer: {
        name: 'Reviewer',
        capabilities: ['code-review'],
        reportsTo: 'engineer',
      },
      lead: {
        name: 'Lead',
        capabilities: ['management'],
        singleton: true,
      },
    },
  },
  workflow: {
    name: 'test-workflow',
    steps: [
      { type: 'assign', role: 'engineer', task: 'Write code' },
      { type: 'review', reviewer: 'reviewer', subject: 'step_0_result' },
      { type: 'approve', approver: 'lead', subject: 'step_1_result' },
    ],
  },
};

describe('OrgChartCompiler', () => {
  describe('parse', () => {
    it('should parse YAML input', () => {
      const yaml = `
name: my-pattern
structure:
  name: My Structure
  roles:
    worker:
      capabilities: [work]
workflow:
  name: my-workflow
  steps:
    - type: assign
      role: worker
      task: Do work
`;
      const pattern = OrgChartCompiler.parse(yaml, 'yaml');
      expect(pattern.name).toBe('my-pattern');
      expect(pattern.structure.roles.worker.capabilities).toContain('work');
    });

    it('should parse JSON input', () => {
      const json = JSON.stringify(samplePattern);
      const pattern = OrgChartCompiler.parse(json, 'json');
      expect(pattern.name).toBe('test-team');
    });
  });

  describe('validate', () => {
    it('should validate correct patterns', () => {
      const result = OrgChartCompiler.validate(samplePattern);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch missing name', () => {
      const invalid = { ...samplePattern, name: '' };
      const result = OrgChartCompiler.validate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'name')).toBe(true);
    });

    it('should catch missing structure', () => {
      const invalid = { name: 'test', workflow: samplePattern.workflow } as OrgPattern;
      const result = OrgChartCompiler.validate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'structure')).toBe(true);
    });

    it('should catch unknown role references in steps', () => {
      const invalid: OrgPattern = {
        ...samplePattern,
        workflow: {
          name: 'test',
          steps: [{ type: 'assign', role: 'nonexistent', task: 'test' }],
        },
      };
      const result = OrgChartCompiler.validate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Unknown role'))).toBe(true);
    });
  });

  describe('compile', () => {
    it('should compile to prism target by default', () => {
      const result = OrgChartCompiler.compile(samplePattern);
      expect(result.name).toBe('test-team');
      expect(result.format).toBe('code');
      expect(result.output).toContain('roleAssignments');
      expect(result.output).toContain('engineer');
    });

    it('should compile to json target', () => {
      const result = OrgChartCompiler.compile(samplePattern, { target: 'json' });
      expect(result.format).toBe('json');
      const parsed = JSON.parse(result.output);
      expect(parsed.name).toBe('test-workflow');
    });

    it('should compile to mermaid target', () => {
      const result = OrgChartCompiler.compile(samplePattern, { target: 'mermaid' });
      expect(result.format).toBe('code');
      expect(result.output).toContain('graph TD');
      expect(result.output).toContain('engineer');
    });

    it('should include comments when requested', () => {
      const result = OrgChartCompiler.compile(samplePattern, { includeComments: true });
      expect(result.output).toContain('//');
    });

    it('should exclude comments when requested', () => {
      const result = OrgChartCompiler.compile(samplePattern, {
        target: 'prism',
        includeComments: false,
      });
      // Should still generate code, just without comment lines
      expect(result.output).toContain('roleAssignments');
    });

    it('should extract metadata', () => {
      const result = OrgChartCompiler.compile(samplePattern);
      expect(result.metadata.name).toBe('test-team');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.capabilities).toContain('coding');
      expect(result.metadata.capabilities).toContain('code-review');
      expect(result.metadata.roles).toContain('engineer');
      expect(result.metadata.agentCounts.min).toBe(4); // 2 engineers + 1 reviewer + 1 lead
    });
  });

  describe('compileToJson', () => {
    it('should create JSON execution plan', () => {
      const plan = OrgChartCompiler.compileToJson(samplePattern);
      expect((plan as any).name).toBe('test-team');
      expect((plan as any).structure.roles.engineer).toBeDefined();
      expect((plan as any).workflow.steps).toHaveLength(3);
    });
  });

  describe('custom targets', () => {
    it('should register and use custom targets', () => {
      const customTarget: CompileTarget = {
        name: 'custom',
        format: 'code',
        emitRole: (role, id) => `ROLE: ${id}`,
        emitWorkflow: (wf) => `WORKFLOW: ${wf.name}`,
        emitStep: (step, idx) => `STEP: ${idx}`,
        join: (parts) => parts.join('\n'),
      };

      OrgChartCompiler.registerTarget(customTarget);
      expect(OrgChartCompiler.getTargets()).toContain('custom');

      const result = OrgChartCompiler.compile(samplePattern, { target: 'custom' });
      expect(result.output).toContain('ROLE: engineer');
      expect(result.output).toContain('WORKFLOW: test-workflow');

      OrgChartCompiler.unregisterTarget('custom');
      expect(OrgChartCompiler.getTargets()).not.toContain('custom');
    });
  });

  describe('createTarget', () => {
    it('should create a target with defaults', () => {
      const target = createTarget({ name: 'test' });
      expect(target.name).toBe('test');
      expect(target.format).toBe('code');
      expect(typeof target.emitRole).toBe('function');
    });

    it('should allow overriding functions', () => {
      const target = createTarget({
        name: 'test',
        emitRole: (role, id) => `Custom: ${id}`,
      });
      expect(target.emitRole({} as any, 'test', {} as any)).toBe('Custom: test');
    });
  });

  describe('getTargets', () => {
    it('should list built-in targets', () => {
      const targets = OrgChartCompiler.getTargets();
      expect(targets).toContain('prism');
      expect(targets).toContain('json');
      expect(targets).toContain('mermaid');
    });
  });
});

describe('Workflow Step Compilation', () => {
  it('should compile parallel steps', () => {
    const pattern: OrgPattern = {
      name: 'parallel-test',
      structure: {
        name: 'Test',
        roles: {
          worker: { capabilities: ['work'] },
        },
      },
      workflow: {
        name: 'test',
        steps: [
          {
            type: 'parallel',
            steps: [
              { type: 'assign', role: 'worker', task: 'Task 1' },
              { type: 'assign', role: 'worker', task: 'Task 2' },
            ],
          },
        ],
      },
    };

    const result = OrgChartCompiler.compile(pattern);
    expect(result.output).toContain('Task 1');
    expect(result.output).toContain('Task 2');
  });

  it('should compile condition steps', () => {
    const pattern: OrgPattern = {
      name: 'condition-test',
      structure: {
        name: 'Test',
        roles: {
          worker: { capabilities: ['work'] },
        },
      },
      workflow: {
        name: 'test',
        steps: [
          {
            type: 'condition',
            check: 'confidence > 0.8',
            then: { type: 'assign', role: 'worker', task: 'High confidence task' },
            else: { type: 'assign', role: 'worker', task: 'Low confidence task' },
          },
        ],
      },
    };

    const result = OrgChartCompiler.compile(pattern);
    expect(result.output).toContain('confidence > 0.8');
    expect(result.output).toContain('High confidence task');
    expect(result.output).toContain('Low confidence task');
  });

  it('should compile aggregate steps', () => {
    const pattern: OrgPattern = {
      name: 'aggregate-test',
      structure: {
        name: 'Test',
        roles: {
          worker: { capabilities: ['work'] },
        },
      },
      workflow: {
        name: 'test',
        steps: [
          { type: 'assign', role: 'worker', task: 'Work' },
          { type: 'aggregate', method: 'consensus' },
        ],
      },
    };

    const result = OrgChartCompiler.compile(pattern);
    expect(result.output).toContain('aggregateConsensus');
  });
});
