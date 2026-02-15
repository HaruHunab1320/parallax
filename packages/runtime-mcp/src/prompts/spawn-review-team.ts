/**
 * Spawn Review Team Prompt
 *
 * Template for spawning a coordinated code review team:
 * - Architect: High-level design review
 * - Reviewer: Detailed code review
 * - Test Engineer: Test coverage analysis
 */

export const SPAWN_REVIEW_TEAM_PROMPT = {
  name: 'spawn_review_team',
  description:
    'Spawn a coordinated code review team with architect, reviewer, and test engineer agents',
  arguments: [
    {
      name: 'project_dir',
      description: 'Path to the project directory to review',
      required: true,
    },
    {
      name: 'review_focus',
      description:
        'Focus area for the review (e.g., "security", "performance", "architecture", "all")',
      required: false,
    },
  ],
};

export interface SpawnReviewTeamArgs {
  project_dir: string;
  review_focus?: string;
}

export function generateSpawnReviewTeamPrompt(args: SpawnReviewTeamArgs): {
  messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
} {
  const focus = args.review_focus || 'all';

  const prompt = `
You are setting up a code review team for the project at: ${args.project_dir}

Review Focus: ${focus}

Please spawn the following agents in order:

1. **Architect Agent** (spawn first)
   - Name: "architect"
   - Type: claude
   - Capabilities: ["architecture_review", "design_patterns", "system_design"]
   - Role: architect
   - Workdir: ${args.project_dir}

2. **Code Reviewer Agent** (reports to architect)
   - Name: "reviewer"
   - Type: claude
   - Capabilities: ["code_review", "best_practices", "bug_detection"]
   - Role: reviewer
   - Reports to: architect agent ID
   - Workdir: ${args.project_dir}

3. **Test Engineer Agent** (reports to architect)
   - Name: "test-engineer"
   - Type: claude
   - Capabilities: ["test_coverage", "test_quality", "edge_cases"]
   - Role: qa
   - Reports to: architect agent ID
   - Workdir: ${args.project_dir}

After spawning all agents:
1. Send a task to the architect to perform initial architecture review
2. Once architect responds, coordinate reviewer and test-engineer to analyze specific files
3. Aggregate findings from all three agents

Use the spawn, send, and get tools to accomplish this.
`.trim();

  return {
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: prompt },
      },
    ],
  };
}
