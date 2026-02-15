/**
 * Logs Resource - logs://{agentId}
 *
 * Provides agent terminal output logs.
 * Supports subscription for real-time updates.
 */

import type { LocalRuntime } from '@parallax/runtime-local';

export const LOGS_RESOURCE_TEMPLATE = {
  uriTemplate: 'logs://{agentId}',
  name: 'Agent Logs',
  description: 'Terminal output from an agent',
  mimeType: 'text/plain',
};

/**
 * Parse agent ID from logs URI
 */
export function parseLogsUri(uri: string): string | null {
  const match = uri.match(/^logs:\/\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * List all available log resources
 */
export async function listLogsResources(
  runtime: LocalRuntime
): Promise<Array<{ uri: string; name: string; description: string; mimeType: string }>> {
  const agents = await runtime.list();

  return agents.map((agent) => ({
    uri: `logs://${agent.id}`,
    name: `Logs: ${agent.name}`,
    description: `Terminal output from ${agent.type} agent`,
    mimeType: 'text/plain',
  }));
}

/**
 * Read logs resource content
 */
export async function readLogsResource(
  runtime: LocalRuntime,
  uri: string,
  tail = 100
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | null> {
  const agentId = parseLogsUri(uri);
  if (!agentId) {
    return null;
  }

  const agent = await runtime.get(agentId);
  if (!agent) {
    return null;
  }

  const logs: string[] = [];
  const logIterator = runtime.logs(agentId, { tail });

  for await (const line of logIterator) {
    logs.push(line);
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'text/plain',
        text: logs.join('\n'),
      },
    ],
  };
}

/**
 * Subscribe to logs for real-time updates
 *
 * Returns an async iterable that yields log updates.
 * The caller is responsible for converting this to MCP subscription events.
 */
export async function* subscribeLogsResource(
  runtime: LocalRuntime,
  uri: string
): AsyncIterable<{ uri: string; content: string }> {
  const agentId = parseLogsUri(uri);
  if (!agentId) {
    return;
  }

  const agent = await runtime.get(agentId);
  if (!agent) {
    return;
  }

  // Use follow mode for streaming
  const logIterator = runtime.logs(agentId, { follow: true });

  for await (const line of logIterator) {
    yield { uri, content: line };
  }
}
