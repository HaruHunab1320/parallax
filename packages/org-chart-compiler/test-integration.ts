/**
 * Integration test for @parallax/org-chart-compiler
 *
 * Tests that the package can be imported and used correctly.
 * Run with: npx tsx test-integration.ts
 */

import {
  OrgChartCompiler,
  createTarget,
  validatePattern,
  prismTarget,
  jsonTarget,
  mermaidTarget,
  listTargets,
} from './src/index';

import type {
  OrgPattern,
  CompileResult,
  ValidationResult,
  CompileTarget,
} from './src/index';

async function runTests() {
  console.log('Running integration tests for @parallax/org-chart-compiler\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result
          .then(() => {
            console.log(`  ✓ ${name}`);
            passed++;
          })
          .catch((error) => {
            console.log(`  ✗ ${name}: ${error.message}`);
            failed++;
          });
      }
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ✗ ${name}: ${(error as Error).message}`);
      failed++;
    }
  }

  const samplePattern: OrgPattern = {
    name: 'integration-test',
    version: '1.0.0',
    structure: {
      name: 'Test Team',
      roles: {
        engineer: {
          name: 'Engineer',
          capabilities: ['coding'],
          minInstances: 2,
        },
        reviewer: {
          name: 'Reviewer',
          capabilities: ['review'],
          reportsTo: 'engineer',
        },
      },
    },
    workflow: {
      name: 'test-workflow',
      steps: [
        { type: 'assign', role: 'engineer', task: 'Write code' },
        { type: 'review', reviewer: 'reviewer', subject: 'step_0' },
      ],
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  console.log('Testing exports...');

  test('OrgChartCompiler is exported', () => {
    if (typeof OrgChartCompiler !== 'function') throw new Error('Not a class');
  });

  test('createTarget is exported', () => {
    if (typeof createTarget !== 'function') throw new Error('Not a function');
  });

  test('validatePattern is exported', () => {
    if (typeof validatePattern !== 'function') throw new Error('Not a function');
  });

  test('prismTarget is exported', () => {
    if (!prismTarget || prismTarget.name !== 'prism') throw new Error('Invalid target');
  });

  test('jsonTarget is exported', () => {
    if (!jsonTarget || jsonTarget.name !== 'json') throw new Error('Invalid target');
  });

  test('mermaidTarget is exported', () => {
    if (!mermaidTarget || mermaidTarget.name !== 'mermaid') throw new Error('Invalid target');
  });

  test('listTargets is exported', () => {
    if (typeof listTargets !== 'function') throw new Error('Not a function');
    const targets = listTargets();
    if (!targets.includes('prism')) throw new Error('Missing prism target');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting parse...');

  test('parse YAML input', () => {
    const yaml = `
name: yaml-test
structure:
  name: Test
  roles:
    worker:
      capabilities: [work]
workflow:
  name: test
  steps: []
`;
    const pattern = OrgChartCompiler.parse(yaml);
    if (pattern.name !== 'yaml-test') throw new Error('Wrong name');
  });

  test('parse JSON input', () => {
    const json = JSON.stringify(samplePattern);
    const pattern = OrgChartCompiler.parse(json, 'json');
    if (pattern.name !== 'integration-test') throw new Error('Wrong name');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting validate...');

  test('validate correct pattern', () => {
    const result = OrgChartCompiler.validate(samplePattern);
    if (!result.valid) throw new Error('Should be valid');
  });

  test('validate catches errors', () => {
    const invalid = { name: '', structure: null, workflow: null } as any;
    const result = OrgChartCompiler.validate(invalid);
    if (result.valid) throw new Error('Should be invalid');
    if (result.errors.length === 0) throw new Error('Should have errors');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting compile...');

  test('compile to prism', () => {
    const result = OrgChartCompiler.compile(samplePattern);
    if (result.format !== 'code') throw new Error('Wrong format');
    if (!result.output.includes('roleAssignments')) throw new Error('Missing expected output');
  });

  test('compile to json', () => {
    const result = OrgChartCompiler.compile(samplePattern, { target: 'json' });
    if (result.format !== 'json') throw new Error('Wrong format');
    const parsed = JSON.parse(result.output);
    if (!parsed.name) throw new Error('Invalid JSON output');
  });

  test('compile to mermaid', () => {
    const result = OrgChartCompiler.compile(samplePattern, { target: 'mermaid' });
    if (result.format !== 'code') throw new Error('Wrong format');
    if (!result.output.includes('graph TD')) throw new Error('Missing mermaid header');
  });

  test('extract metadata', () => {
    const result = OrgChartCompiler.compile(samplePattern);
    if (result.metadata.name !== 'integration-test') throw new Error('Wrong name');
    if (!result.metadata.capabilities.includes('coding')) throw new Error('Missing capability');
    if (result.metadata.agentCounts.min !== 3) throw new Error('Wrong agent count');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting custom targets...');

  test('register custom target', () => {
    const target = createTarget({
      name: 'custom-test',
      format: 'code',
      emitRole: (r, id) => `ROLE:${id}`,
      emitWorkflow: (w) => `WORKFLOW:${w.name}`,
      join: (parts) => parts.join('|'),
    });

    OrgChartCompiler.registerTarget(target);
    if (!OrgChartCompiler.getTargets().includes('custom-test')) {
      throw new Error('Target not registered');
    }

    const result = OrgChartCompiler.compile(samplePattern, { target: 'custom-test' });
    if (!result.output.includes('ROLE:engineer')) {
      throw new Error('Custom target not used');
    }

    OrgChartCompiler.unregisterTarget('custom-test');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting compileToJson...');

  test('compileToJson creates execution plan', () => {
    const plan = OrgChartCompiler.compileToJson(samplePattern) as any;
    if (plan.name !== 'integration-test') throw new Error('Wrong name');
    if (!plan.structure.roles.engineer) throw new Error('Missing role');
    if (!plan.workflow.steps) throw new Error('Missing steps');
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nTesting type exports...');

  test('Type imports work correctly', () => {
    const pattern: OrgPattern = samplePattern;
    const result: CompileResult = OrgChartCompiler.compile(pattern);
    const validation: ValidationResult = OrgChartCompiler.validate(pattern);
    const target: CompileTarget = prismTarget;

    if (!pattern.name || !result.output || !validation.valid || !target.name) {
      throw new Error('Types not working');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
