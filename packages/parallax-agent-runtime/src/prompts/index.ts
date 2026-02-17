/**
 * MCP Prompt Templates
 *
 * Pre-built prompts for common agent orchestration patterns.
 */

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export interface PromptResult {
  [key: string]: unknown;
  messages: PromptMessage[];
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

export const PROMPTS: PromptDefinition[] = [
  {
    name: 'spawn_review_team',
    description: 'Spawn a coordinated code review team',
    arguments: [
      { name: 'project_dir', description: 'Path to the project directory', required: true },
      { name: 'review_focus', description: 'Focus area for review', required: false },
    ],
  },
  {
    name: 'spawn_dev_agent',
    description: 'Quickly spawn a development agent for a task',
    arguments: [
      { name: 'task', description: 'Task description', required: true },
      { name: 'project_dir', description: 'Project directory', required: true },
      { name: 'agent_type', description: 'Agent type (claude, codex, gemini, aider)', required: false },
    ],
  },
];

export interface SpawnReviewTeamArgs {
  project_dir: string;
  review_focus?: string;
}

export function generateSpawnReviewTeamPrompt(args: SpawnReviewTeamArgs): PromptResult {
  const focusText = args.review_focus
    ? `Focus specifically on: ${args.review_focus}`
    : 'Perform a comprehensive review covering code quality, architecture, and potential issues';

  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I need you to spawn a coordinated code review team for the project at ${args.project_dir}.

Please create the following agents:

1. **Architect Agent** (claude or gemini)
   - Role: architect
   - Capabilities: architecture_review, design_patterns, system_design
   - Task: Review overall architecture and design decisions

2. **Code Quality Agent** (claude or aider)
   - Role: reviewer
   - Capabilities: code_review, best_practices, security
   - Task: Review code quality, security, and best practices

3. **Test Engineer Agent** (claude or codex)
   - Role: qa
   - Capabilities: testing, coverage, edge_cases
   - Task: Identify missing tests and edge cases

${focusText}

After spawning, have each agent report their findings. Coordinate between them to avoid duplicate feedback.`,
        },
      },
    ],
  };
}

export interface SpawnDevAgentArgs {
  task: string;
  project_dir: string;
  agent_type?: string;
}

export function generateSpawnDevAgentPrompt(args: SpawnDevAgentArgs): PromptResult {
  const agentType = args.agent_type || 'claude';

  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Spawn a ${agentType} development agent to work on the following task:

**Project:** ${args.project_dir}

**Task:** ${args.task}

Configure the agent with:
- Appropriate capabilities for the task
- Working directory set to the project
- Role: engineer

After spawning, send the task to the agent and monitor progress.`,
        },
      },
    ],
  };
}
