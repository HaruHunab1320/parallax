/**
 * MCP Resource Handlers
 *
 * Exposes agent state and logs as MCP resources.
 */

import type { AgentManager } from '../agent-manager.js';

export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface ResourceContents {
  [key: string]: unknown;
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
}

/**
 * List available agent resources
 */
export async function listAgentResources(manager: AgentManager): Promise<Resource[]> {
  const agents = await manager.list();
  return agents.map(agent => ({
    uri: `agents://${agent.id}`,
    name: `Agent: ${agent.name}`,
    description: `${agent.type} agent - ${agent.status}`,
    mimeType: 'application/json',
  }));
}

/**
 * Read an agent resource
 */
export async function readAgentResource(
  manager: AgentManager,
  uri: string
): Promise<ResourceContents | null> {
  const agentId = uri.replace('agents://', '');
  const agent = await manager.get(agentId);

  if (!agent) {
    return null;
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(agent, null, 2),
      },
    ],
  };
}

/**
 * List available logs resources
 */
export async function listLogsResources(manager: AgentManager): Promise<Resource[]> {
  const agents = await manager.list();
  return agents.map(agent => ({
    uri: `logs://${agent.id}`,
    name: `Logs: ${agent.name}`,
    description: `Terminal output from ${agent.name}`,
    mimeType: 'text/plain',
  }));
}

/**
 * Read logs resource
 */
export async function readLogsResource(
  manager: AgentManager,
  uri: string
): Promise<ResourceContents | null> {
  const agentId = uri.replace('logs://', '');
  const agent = await manager.get(agentId);

  if (!agent) {
    return null;
  }

  const lines: string[] = [];
  for await (const line of manager.logs(agentId)) {
    lines.push(line);
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'text/plain',
        text: lines.join('\n'),
      },
    ],
  };
}
