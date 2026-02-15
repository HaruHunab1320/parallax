/**
 * Spawn Dev Agent Prompt
 *
 * Quick template for spawning a single development agent
 * to work on a specific task.
 */

export const SPAWN_DEV_AGENT_PROMPT = {
  name: 'spawn_dev_agent',
  description: 'Quickly spawn a development agent for a specific task',
  arguments: [
    {
      name: 'task',
      description: 'Description of the task for the agent to work on',
      required: true,
    },
    {
      name: 'project_dir',
      description: 'Path to the project directory',
      required: true,
    },
    {
      name: 'agent_type',
      description: 'Type of agent to spawn (claude, codex, gemini, aider)',
      required: false,
    },
  ],
};

export interface SpawnDevAgentArgs {
  task: string;
  project_dir: string;
  agent_type?: 'claude' | 'codex' | 'gemini' | 'aider';
}

export function generateSpawnDevAgentPrompt(args: SpawnDevAgentArgs): {
  messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
} {
  const agentType = args.agent_type || 'claude';

  // Determine capabilities based on task keywords
  const capabilities = inferCapabilities(args.task);
  const agentName = generateAgentName(args.task);

  const prompt = `
You need to spawn a development agent to work on the following task:

**Task:** ${args.task}
**Project Directory:** ${args.project_dir}
**Agent Type:** ${agentType}

Spawn the agent with these settings:
- Name: "${agentName}"
- Type: ${agentType}
- Capabilities: ${JSON.stringify(capabilities)}
- Role: developer
- Workdir: ${args.project_dir}
- Wait for ready: true

After the agent is ready, send it the task:
"${args.task}"

Wait for the agent's response and report back the result.

Use the spawn and send tools to accomplish this.
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

function inferCapabilities(task: string): string[] {
  const taskLower = task.toLowerCase();
  const capabilities: string[] = ['code_writing'];

  if (taskLower.includes('bug') || taskLower.includes('fix')) {
    capabilities.push('debugging');
  }

  if (taskLower.includes('test')) {
    capabilities.push('testing');
  }

  if (taskLower.includes('refactor')) {
    capabilities.push('refactoring');
  }

  if (taskLower.includes('review')) {
    capabilities.push('code_review');
  }

  if (taskLower.includes('api') || taskLower.includes('endpoint')) {
    capabilities.push('api_development');
  }

  if (taskLower.includes('document') || taskLower.includes('readme')) {
    capabilities.push('documentation');
  }

  return capabilities;
}

function generateAgentName(task: string): string {
  // Extract first few meaningful words for the name
  const words = task
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with'].includes(w))
    .slice(0, 2);

  return words.length > 0 ? `dev-${words.join('-')}` : 'dev-agent';
}
