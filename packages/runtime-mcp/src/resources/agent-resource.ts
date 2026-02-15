/**
 * Agent Resource - agents://{agentId}
 *
 * Provides current agent state as a JSON resource.
 */

import type { LocalRuntime } from '@parallax/runtime-local';
import type { AgentHandle } from '@parallax/runtime-interface';

export const AGENT_RESOURCE_TEMPLATE = {
  uriTemplate: 'agents://{agentId}',
  name: 'Agent State',
  description: 'Current state of an agent as JSON',
  mimeType: 'application/json',
};

/**
 * Parse agent ID from URI
 */
export function parseAgentUri(uri: string): string | null {
  const match = uri.match(/^agents:\/\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * List all available agent resources
 */
export async function listAgentResources(
  runtime: LocalRuntime
): Promise<Array<{ uri: string; name: string; description: string; mimeType: string }>> {
  const agents = await runtime.list();

  return agents.map((agent) => ({
    uri: `agents://${agent.id}`,
    name: `Agent: ${agent.name}`,
    description: `${agent.type} agent (${agent.status})`,
    mimeType: 'application/json',
  }));
}

/**
 * Read agent resource content
 */
export async function readAgentResource(
  runtime: LocalRuntime,
  uri: string
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | null> {
  const agentId = parseAgentUri(uri);
  if (!agentId) {
    return null;
  }

  const agent = await runtime.get(agentId);
  if (!agent) {
    return null;
  }

  // Serialize agent with Date objects converted to ISO strings
  const serializedAgent = serializeAgent(agent);

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(serializedAgent, null, 2),
      },
    ],
  };
}

function serializeAgent(agent: AgentHandle): Record<string, unknown> {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    status: agent.status,
    endpoint: agent.endpoint,
    pid: agent.pid,
    containerId: agent.containerId,
    podName: agent.podName,
    role: agent.role,
    capabilities: agent.capabilities,
    startedAt: agent.startedAt?.toISOString(),
    lastActivityAt: agent.lastActivityAt?.toISOString(),
    error: agent.error,
    exitCode: agent.exitCode,
  };
}
