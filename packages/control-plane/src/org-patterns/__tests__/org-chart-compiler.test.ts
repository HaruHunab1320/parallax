import { describe, expect, it } from 'vitest';
import {
  compileOrgPattern,
  type CompiledPattern,
  type CompilerOptions,
} from '../org-chart-compiler';
import type { OrgPattern } from '../types';

/** Minimal valid org pattern for testing */
function makePattern(overrides: Partial<OrgPattern> = {}): OrgPattern {
  return {
    name: 'test-pattern',
    version: '1.0.0',
    description: 'Test pattern',
    structure: {
      name: 'test-structure',
      roles: {
        architect: {
          id: 'architect',
          name: 'Architect',
          agentType: 'claude-code',
          capabilities: ['planning'],
          singleton: true,
        },
      },
    },
    workflow: {
      name: 'test-workflow',
      steps: [
        {
          type: 'assign',
          role: 'architect',
          task: 'Plan the project',
        },
      ],
    },
    ...overrides,
  };
}

describe('compileOrgPattern', () => {
  it('compiles a minimal pattern to Prism script', () => {
    const pattern = makePattern();
    const result = compileOrgPattern(pattern);

    expect(result.name).toBe('test-pattern');
    expect(result.script).toContain('let roles =');
    expect(result.script).toContain('let roleExecution =');
    expect(result.script).toContain('let roleAssignments =');
    expect(result.script).toContain('let finalResult =');
    expect(result.script).toContain('finalResult');
  });

  it('returns correct metadata', () => {
    const pattern = makePattern();
    const result = compileOrgPattern(pattern);

    expect(result.metadata.name).toBe('test-pattern');
    expect(result.metadata.version).toBe('1.0.0');
    expect(result.metadata.description).toBe('Test pattern');
    expect(result.metadata.agents.capabilities).toContain('planning');
    expect(result.metadata.agents.minAgents).toBe(1);
    expect(result.metadata.agents.maxAgents).toBe(1);
  });

  it('calculates agent counts from role definitions', () => {
    const pattern = makePattern({
      structure: {
        name: 'multi-role',
        roles: {
          architect: {
            id: 'architect',
            name: 'Architect',
            agentType: 'claude-code',
            capabilities: ['planning'],
            singleton: true,
          },
          engineer: {
            id: 'engineer',
            name: 'Engineer',
            agentType: 'claude-code',
            capabilities: ['coding'],
            minInstances: 3,
            maxInstances: 5,
          },
        },
      },
    });
    const result = compileOrgPattern(pattern);

    expect(result.metadata.agents.minAgents).toBe(4); // 1 + 3
    expect(result.metadata.agents.maxAgents).toBe(6); // 1 + 5
  });

  it('deduplicates capabilities across roles', () => {
    const pattern = makePattern({
      structure: {
        name: 'shared-caps',
        roles: {
          lead: {
            id: 'lead',
            name: 'Lead',
            agentType: 'claude-code',
            capabilities: ['planning', 'coding'],
            singleton: true,
          },
          worker: {
            id: 'worker',
            name: 'Worker',
            agentType: 'claude-code',
            capabilities: ['coding', 'testing'],
            minInstances: 2,
          },
        },
      },
    });
    const result = compileOrgPattern(pattern);

    expect(result.metadata.agents.capabilities).toEqual(
      expect.arrayContaining(['planning', 'coding', 'testing'])
    );
    // No duplicates
    const unique = new Set(result.metadata.agents.capabilities);
    expect(unique.size).toBe(result.metadata.agents.capabilities.length);
  });

  describe('compiler options', () => {
    it('includes comments by default', () => {
      const result = compileOrgPattern(makePattern());
      expect(result.script).toContain('// Auto-generated from org-chart');
      expect(result.script).toContain('// === Team Structure ===');
    });

    it('excludes comments when disabled', () => {
      const result = compileOrgPattern(makePattern(), {
        includeComments: false,
      });
      expect(result.script).not.toContain('// Auto-generated');
      expect(result.script).not.toContain('// === Team Structure ===');
    });

    it('joins with spaces when prettyPrint is false', () => {
      const result = compileOrgPattern(makePattern(), {
        prettyPrint: false,
        includeComments: false,
      });
      // Lines should be space-separated (except JSON.stringify which adds its own newlines)
      const nonJsonLines = result.script
        .split(' ')
        .filter((p) => !p.includes('{'));
      expect(nonJsonLines.length).toBeGreaterThan(1);
    });
  });

  describe('role assignment generation', () => {
    it('generates while-loop agent mapping per role', () => {
      const result = compileOrgPattern(makePattern());
      expect(result.script).toContain('let _roleAgents_architect = [];');
      expect(result.script).toContain('while (_ri_architect < 1)');
      expect(result.script).toContain(
        '_roleAgents_architect = [..._roleAgents_architect, agentResults[_ri_architect]]'
      );
    });

    it('generates correct agent index offsets for multiple roles', () => {
      const pattern = makePattern({
        structure: {
          name: 'multi',
          roles: {
            lead: {
              id: 'lead',
              name: 'Lead',
              agentType: 'claude-code',
              capabilities: ['planning'],
              singleton: true,
            },
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'claude-code',
              capabilities: ['coding'],
              minInstances: 3,
            },
          },
        },
      });
      const result = compileOrgPattern(pattern);

      // lead starts at index 0, takes 1
      expect(result.script).toContain('let _ri_lead = 0;');
      expect(result.script).toContain('while (_ri_lead < 1)');
      // worker starts at index 1, takes 3
      expect(result.script).toContain('let _ri_worker = 1;');
      expect(result.script).toContain('while (_ri_worker < 4)');
    });

    it('builds roleAssignments as a single object literal', () => {
      const pattern = makePattern({
        structure: {
          name: 'multi',
          roles: {
            lead: {
              id: 'lead',
              name: 'Lead',
              agentType: 'claude-code',
              capabilities: ['planning'],
              singleton: true,
            },
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'claude-code',
              capabilities: ['coding'],
              minInstances: 2,
            },
          },
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('let roleAssignments = {');
      expect(result.script).toContain('lead: _roleAgents_lead,');
      expect(result.script).toContain('worker: _roleAgents_worker');
    });
  });

  describe('assign step compilation', () => {
    it('compiles assign step with role lookup', () => {
      const result = compileOrgPattern(makePattern());
      expect(result.script).toContain('step_0_result');
      expect(result.script).toContain(
        'let _assign_roleAgents_step_0_result = roleAssignments["architect"]'
      );
    });

    it('handles missing role gracefully', () => {
      const result = compileOrgPattern(makePattern());
      // Should emit null-coalescing fallback
      expect(result.script).toContain('?? []');
    });

    it('compiles thread-enabled assign step', () => {
      const pattern = makePattern({
        structure: {
          name: 'threaded',
          roles: {
            architect: {
              id: 'architect',
              name: 'Architect',
              agentType: 'claude-code',
              capabilities: ['planning'],
              singleton: true,
              threadConfig: { enabled: true, objective: 'Plan the project' },
            },
          },
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('mode: "thread"');
      expect(result.script).toContain('spawnRoleThread');
      expect(result.script).toContain('sendRoleThreadInput');
      expect(result.script).toContain('awaitRoleThread');
    });
  });

  describe('parallel step compilation', () => {
    it('compiles parallel substeps into array', () => {
      const pattern = makePattern({
        structure: {
          name: 'parallel',
          roles: {
            lead: {
              id: 'lead',
              name: 'Lead',
              agentType: 'claude-code',
              capabilities: ['planning'],
              singleton: true,
            },
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'claude-code',
              capabilities: ['coding'],
              minInstances: 2,
            },
          },
        },
        workflow: {
          name: 'parallel-flow',
          steps: [
            {
              type: 'parallel',
              steps: [
                { type: 'assign', role: 'lead', task: 'Plan' },
                { type: 'assign', role: 'worker', task: 'Code' },
              ],
            },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('let step_0_result = [];');
      expect(result.script).toContain('step_0_sub_0');
      expect(result.script).toContain('step_0_sub_1');
      expect(result.script).toContain(
        'step_0_result = [...step_0_result, step_0_sub_0]'
      );
    });

    it('renames variables outside quotes only', () => {
      const pattern = makePattern({
        workflow: {
          name: 'rename-test',
          steps: [
            {
              type: 'parallel',
              steps: [
                {
                  type: 'assign',
                  role: 'architect',
                  task: 'Build step_0_result processor',
                },
              ],
            },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      // Inside the task string, step_0_result should remain unchanged
      expect(result.script).toContain('Build step_0_result processor');
    });
  });

  describe('sequential step compilation', () => {
    it('compiles sequential substeps', () => {
      const pattern = makePattern({
        workflow: {
          name: 'seq-flow',
          steps: [
            {
              type: 'sequential',
              steps: [
                { type: 'assign', role: 'architect', task: 'Plan' },
                { type: 'assign', role: 'architect', task: 'Refine' },
              ],
            },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('step_0_seq_0');
      expect(result.script).toContain('step_0_seq_1');
    });
  });

  describe('review step compilation', () => {
    it('compiles review step', () => {
      const pattern = makePattern({
        workflow: {
          name: 'review-flow',
          steps: [
            { type: 'assign', role: 'architect', task: 'Write code' },
            {
              type: 'review',
              reviewer: 'architect',
              subject: 'step_0_result',
            },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('// Review by Architect');
      expect(result.script).toContain('_review_agents_step_1_result');
      expect(result.script).toContain('approved:');
    });
  });

  describe('approve step compilation', () => {
    it('compiles approve step', () => {
      const pattern = makePattern({
        workflow: {
          name: 'approve-flow',
          steps: [
            { type: 'assign', role: 'architect', task: 'Propose change' },
            {
              type: 'approve',
              approver: 'architect',
              subject: 'step_0_result',
            },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('// Approval by architect');
      expect(result.script).toContain('_approve_agents_step_1_result');
    });
  });

  describe('aggregate step compilation', () => {
    it('compiles consensus aggregation', () => {
      const pattern = makePattern({
        workflow: {
          name: 'agg-flow',
          steps: [
            {
              type: 'parallel',
              steps: [
                { type: 'assign', role: 'architect', task: 'A' },
                { type: 'assign', role: 'architect', task: 'B' },
              ],
            },
            { type: 'aggregate', method: 'consensus' },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('aggregateConsensus(step_0_result)');
    });

    it('compiles merge aggregation', () => {
      const pattern = makePattern({
        workflow: {
          name: 'merge-flow',
          steps: [
            {
              type: 'parallel',
              steps: [
                { type: 'assign', role: 'architect', task: 'A' },
              ],
            },
            { type: 'aggregate', method: 'merge' },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('aggregateMerge(step_0_result)');
    });
  });

  describe('condition step compilation', () => {
    it('compiles conditional with then and else branches', () => {
      const pattern = makePattern({
        workflow: {
          name: 'cond-flow',
          steps: [
            { type: 'assign', role: 'architect', task: 'Analyze' },
            {
              type: 'condition',
              check: 'step_0_result.confidence > 0.8',
              then: { type: 'assign', role: 'architect', task: 'Ship it' },
              else: { type: 'assign', role: 'architect', task: 'Revise' },
            },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain(
        'if (step_0_result.confidence > 0.8) {'
      );
      expect(result.script).toContain('step_1_then');
      expect(result.script).toContain('} else {');
      expect(result.script).toContain('step_1_else');
    });

    it('compiles conditional without else branch in the condition block', () => {
      const pattern = makePattern({
        workflow: {
          name: 'cond-no-else',
          steps: [
            { type: 'assign', role: 'architect', task: 'Check' },
            {
              type: 'condition',
              check: 'step_0_result',
              then: { type: 'assign', role: 'architect', task: 'Go' },
            },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('if (step_0_result) {');
      // The condition step should not have an else branch (helper functions may contain else)
      const conditionSection = result.script.split('// Step 1:')[1]?.split('// ===')[0] || '';
      expect(conditionSection).not.toContain('step_1_else');
    });
  });

  describe('select step compilation', () => {
    it('compiles select step for agent-backed role', () => {
      const pattern = makePattern({
        workflow: {
          name: 'select-flow',
          steps: [{ type: 'select', role: 'architect', criteria: 'expertise' }],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('agentId');
      expect(result.script).toContain(
        '_select_agents_step_0_result = roleAssignments["architect"]'
      );
    });

    it('uses threadId for thread-backed roles', () => {
      const pattern = makePattern({
        structure: {
          name: 'threaded',
          roles: {
            architect: {
              id: 'architect',
              name: 'Architect',
              agentType: 'claude-code',
              capabilities: ['planning'],
              singleton: true,
              threadConfig: { enabled: true },
            },
          },
        },
        workflow: {
          name: 'select-thread',
          steps: [{ type: 'select', role: 'architect' }],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('threadId');
    });
  });

  describe('helper functions', () => {
    it('generates calculateConfidence helper', () => {
      const result = compileOrgPattern(makePattern());
      expect(result.script).toContain(
        'function calculateConfidence(results) {'
      );
    });

    it('generates aggregate helpers', () => {
      const result = compileOrgPattern(makePattern());
      expect(result.script).toContain('function aggregateConsensus(results)');
      expect(result.script).toContain('function aggregateMajority(results)');
      expect(result.script).toContain('function aggregateMerge(results)');
      expect(result.script).toContain('function aggregateBest(results)');
    });

    it('generates thread helper functions', () => {
      const result = compileOrgPattern(makePattern());
      expect(result.script).toContain('function spawnRoleThread(');
      expect(result.script).toContain('function sendRoleThreadInput(');
      expect(result.script).toContain('function awaitRoleThread(');
    });
  });

  describe('thread metadata', () => {
    it('includes thread metadata when roles have threadConfig', () => {
      const pattern = makePattern({
        structure: {
          name: 'threaded',
          roles: {
            architect: {
              id: 'architect',
              name: 'Architect',
              agentType: 'claude-code',
              capabilities: ['planning'],
              singleton: true,
              threadConfig: {
                enabled: true,
                objective: 'Plan',
                approvalPreset: 'autonomous',
              },
            },
          },
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.metadata.threads).toBeDefined();
      expect(result.metadata.threads!.enabled).toBe(true);
      expect(result.metadata.threads!.roles).toHaveLength(1);
      expect(result.metadata.threads!.roles[0].roleId).toBe('architect');
      expect(result.metadata.threads!.roles[0].approvalPreset).toBe(
        'autonomous'
      );
    });

    it('omits thread metadata when no roles use threads', () => {
      const result = compileOrgPattern(makePattern());
      expect(result.metadata.threads).toBeUndefined();
    });
  });

  describe('workspace auto-detection', () => {
    it('auto-enables workspace when input has repo field', () => {
      const pattern = makePattern({
        workflow: {
          name: 'repo-flow',
          input: { repo: 'https://github.com/test/repo', objective: 'Build' },
          steps: [{ type: 'assign', role: 'architect', task: 'Plan' }],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.metadata.workspace).toEqual({
        enabled: true,
        branchStrategy: 'feature_branch',
      });
    });

    it('uses explicit workspace config over auto-detection', () => {
      const pattern = makePattern({
        workflow: {
          name: 'explicit-ws',
          input: { repo: 'https://github.com/test/repo' },
          steps: [{ type: 'assign', role: 'architect', task: 'Plan' }],
        },
        metadata: {
          workspace: { enabled: true, branchStrategy: 'trunk' },
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.metadata.workspace).toEqual({
        enabled: true,
        branchStrategy: 'trunk',
      });
    });
  });

  describe('output variable', () => {
    it('defaults to last step result', () => {
      const pattern = makePattern({
        workflow: {
          name: 'default-output',
          steps: [
            { type: 'assign', role: 'architect', task: 'A' },
            { type: 'assign', role: 'architect', task: 'B' },
          ],
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('result: step_1_result');
    });

    it('uses explicit output variable when specified', () => {
      const pattern = makePattern({
        workflow: {
          name: 'explicit-output',
          steps: [{ type: 'assign', role: 'architect', task: 'Plan' }],
          output: 'step_0_result',
        },
      });
      const result = compileOrgPattern(pattern);
      expect(result.script).toContain('result: step_0_result');
    });
  });

  describe('role execution metadata', () => {
    it('includes mode and agentType for each role', () => {
      const pattern = makePattern({
        structure: {
          name: 'meta-test',
          roles: {
            architect: {
              id: 'architect',
              name: 'Architect',
              agentType: 'claude-code',
              capabilities: ['planning'],
              singleton: true,
            },
            worker: {
              id: 'worker',
              name: 'Worker',
              agentType: 'gemini-cli',
              capabilities: ['coding'],
              threadConfig: { enabled: true },
            },
          },
        },
      });
      const result = compileOrgPattern(pattern);
      const roleExec = result.metadata.metadata?.roleExecution;
      expect(roleExec.architect.mode).toBe('agent');
      expect(roleExec.architect.agentType).toBe('claude-code');
      expect(roleExec.worker.mode).toBe('thread');
      expect(roleExec.worker.agentType).toBe('gemini-cli');
    });
  });
});
